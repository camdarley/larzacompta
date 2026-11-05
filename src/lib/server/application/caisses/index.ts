/** Seul module qui écrit dans `session_caisse`, `comptage` et `comptage_coupure` (AD-7, AD-10). */
import {
	comparerAuSoldeAttendu,
	comptageDe,
	controlerDateComptage,
	dernierComptageSession,
	phasesARecaler,
	prefillOuverture,
	sessionDe,
	sessionOuverte,
	soldeCourantCaisse,
	termesRecette,
	totalComptage,
	deciderReouverture
} from '#lib/domaine/caisse/index.ts';
import {
	cartesCaisses,
	detailCaisse,
	rangeeMesCaisses,
	sessionsDeLAction,
	vueSession,
	type EcranComptage
} from '#lib/domaine/caisse/vues.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { ComptageJ, CoupureJ, GrandJournal } from '#lib/domaine/journal.ts';
import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import type { Compte } from '#lib/domaine/parametrage.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import { annulerOperation, ecrireOperation } from '../operations/index.ts';
import { brouillonCaisse, ecrireEcart, natureSysteme } from './ecart.ts';

type SaisieComptage = {
	coupures: CoupureJ[];
	date: DateCivile;
	confirmation: Centimes | null;
};

export type EntreeComptageCaisse = SaisieComptage & { compteId: number; actionId?: number | null };
export type EntreeComptageSession = SaisieComptage & { sessionId: number; corriger?: boolean };

export type ComptageEnregistre = { sessionId: number | null; ecart: Centimes };

const acteur = (o: Outils) => (o.ctx.acces as NonNullable<Ctx['acces']>).id;

function caisseDe(j: Pick<GrandJournal, 'comptes'>, id: number): Compte | undefined {
	const c = j.comptes.find((x) => x.id === id);
	return c?.type === 'caisse' ? c : undefined;
}

/** A3 : un·e compteur·se n'atteint que ses `acces_caisse`. Filtré ici, jamais dans l'interface. */
function autorisee(depots: Socle['depots'], ctx: Ctx, compteId: number): boolean {
	if (ctx.acces === null) return false;
	return ctx.acces.role !== 'compteur' || depots.acces.caissesDe(ctx.acces.id).includes(compteId);
}

function debutAncre(j: Pick<GrandJournal, 'ancres' | 'exercices'>, compteId: number) {
	const ancre = j.ancres.find((a) => a.compteId === compteId);
	return j.exercices.find((e) => e.id === ancre?.exerciceId)?.debut ?? null;
}

function controlerDate(
	o: Outils,
	compteId: number,
	date: DateCivile,
	auPlusTot: DateCivile | null
) {
	const j = o.depots.operations.journal();
	return controlerDateComptage(date, {
		aujourdhui: o.ctx.aujourdhui,
		exercices: j.exercices,
		auPlusTot,
		debutAncre: debutAncre(j, compteId)
	});
}

/** Un Comptage ne remonte pas avant le précédent : le repère de la caisse perdrait son sens. */
function dernierComptageDate(j: GrandJournal, compteId: number, sauf?: number) {
	const dates = j.comptages
		.filter((c) => c.compteId === compteId && c.id !== sauf)
		.map((c) => c.date);
	return dates.sort().at(-1) ?? null;
}

/** La date du Comptage final vient de changer : la phase des Côtés d'un autre jour la suit. */
function recalerPhases(o: Outils, sessionId: number, dateFinale: DateCivile) {
	const j = o.depots.operations.journal();
	for (const { coteId, phase } of phasesARecaler(j, sessionId, dateFinale)) {
		o.depots.operations.definirPhaseCote(coteId, phase);
	}
}

function noterComptage(
	o: Outils,
	compte: Compte,
	id: number,
	total: Centimes,
	evenement: 'comptage.enregistre' | 'comptage.corrige'
) {
	const verbe = evenement === 'comptage.corrige' ? 'corrigé' : 'enregistré';
	o.noter({
		evenement,
		entiteType: 'comptage',
		entiteId: id,
		resume: `a ${verbe} le Comptage de ${compte.libelle} : ${formaterMontant(total)}.`
	});
}

export function creerCaisses(socle: Socle, executer: Executer, lire: Lire) {
	const { depots } = socle;

	const noms = () => ({
		comptes: depots.parametrage.comptes(),
		actions: depots.parametrage.actions()
	});

	/** C1 à C3, C9 : la Session et son Comptage d'ouverture naissent ensemble. */
	function ouvrirSession(
		o: Outils,
		j: GrandJournal,
		compte: Compte,
		e: EntreeComptageCaisse,
		total: Centimes
	): Resultat<ComptageEnregistre> {
		if (sessionOuverte(j, compte.id)) return echec('session_invalide');
		if (e.actionId === undefined) {
			return echec('saisie_invalide', { champs: { actionId: 'champ_requis' } });
		}
		if (e.actionId !== null) {
			const action = o.depots.parametrage.actions().find((a) => a.id === e.actionId);
			if (action === undefined) return echec('element_introuvable');
			if (!action.actif || !action.avecCaisse) return echec('reference_inactive');
		}
		const attendu = soldeCourantCaisse(j, compte.id, { jour: e.date });
		const comparaison = comparerAuSoldeAttendu(total, attendu, e.confirmation);
		if (!comparaison.ok) return comparaison;
		const maintenant = o.ctx.maintenant;
		const sessionId = o.depots.caisses.creerSession({
			compteId: compte.id,
			actionId: e.actionId,
			ouverteLe: maintenant,
			ouvertePar: acteur(o)
		});
		const id = o.depots.caisses.creerComptage({
			compteId: compte.id,
			sessionCaisseId: sessionId,
			type: 'ouverture',
			date: e.date,
			compteLe: maintenant,
			saisiLe: maintenant,
			saisiPar: acteur(o),
			coupures: e.coupures
		});
		const ecart = ecrireEcart(o, compte, e.date, comparaison.valeur.ecart);
		if (!ecart.ok) return ecart;
		if (ecart.valeur !== null) o.depots.caisses.lierEcart(id, ecart.valeur);
		o.noter({
			evenement: 'session.ouverte',
			entiteType: 'session_caisse',
			entiteId: sessionId,
			resume: `a ouvert une Session sur ${compte.libelle}, avec un Fond de caisse de ${formaterMontant(total)}.`
		});
		return succes({ sessionId, ecart: comparaison.valeur.ecart });
	}

	/** Caisse de réserve : un Comptage sans Session ni Action (FR-16). */
	function compterReserve(
		o: Outils,
		j: GrandJournal,
		compte: Compte,
		e: EntreeComptageCaisse,
		total: Centimes
	): Resultat<ComptageEnregistre> {
		const attendu = soldeCourantCaisse(j, compte.id, { jour: e.date });
		const comparaison = comparerAuSoldeAttendu(total, attendu, e.confirmation);
		if (!comparaison.ok) return comparaison;
		const id = o.depots.caisses.creerComptage({
			compteId: compte.id,
			sessionCaisseId: null,
			type: 'controle',
			date: e.date,
			compteLe: o.ctx.maintenant,
			saisiLe: o.ctx.maintenant,
			saisiPar: acteur(o),
			coupures: e.coupures
		});
		const ecart = ecrireEcart(o, compte, e.date, comparaison.valeur.ecart);
		if (!ecart.ok) return ecart;
		if (ecart.valeur !== null) o.depots.caisses.lierEcart(id, ecart.valeur);
		noterComptage(o, compte, id, total, 'comptage.enregistre');
		return succes({ sessionId: null, ecart: comparaison.valeur.ecart });
	}

	const casComptageCaisse: CasUsage<EntreeComptageCaisse, ComptageEnregistre> = {
		droit: 'compter',
		faire(o, e) {
			const j = o.depots.operations.journal();
			const compte = caisseDe(j, e.compteId);
			if (compte === undefined) return echec('element_introuvable');
			if (!autorisee(o.depots, o.ctx, compte.id)) return echec('acces_refuse');
			if (!compte.actif) return echec('compte_inactif');
			const date = controlerDate(o, compte.id, e.date, dernierComptageDate(j, compte.id));
			if (!date.ok) return date;
			const total = totalComptage(e.coupures);
			return compte.reserve
				? compterReserve(o, j, compte, e, total)
				: ouvrirSession(o, j, compte, e, total);
		}
	};

	/** C11 : l'Écart lié s'annule, la comparaison se rejoue, un nouvel Écart naît si besoin. */
	function corrigerOuverture(
		o: Outils,
		compte: Compte,
		comptage: ComptageJ,
		e: EntreeComptageSession,
		total: Centimes
	): Resultat<Centimes> {
		if (comptage.operationEcartId !== null) {
			const annule = annulerOperation(o, comptage.operationEcartId, { parSonModule: true });
			if (!annule.ok) return annule;
			o.depots.caisses.lierEcart(comptage.id, null);
		}
		const attendu = soldeCourantCaisse(o.depots.operations.journal(), compte.id, {
			jour: e.date,
			jusqua: comptage.compteLe,
			sauf: comptage.id
		});
		const comparaison = comparerAuSoldeAttendu(total, attendu, e.confirmation);
		if (!comparaison.ok) return comparaison;
		const ecart = ecrireEcart(o, compte, e.date, comparaison.valeur.ecart);
		if (!ecart.ok) return ecart;
		if (ecart.valeur !== null) o.depots.caisses.lierEcart(comptage.id, ecart.valeur);
		return succes(comparaison.valeur.ecart);
	}

	/** C10 : le Comptage final n'est comparé à rien, et ne renvoie aucune recette. */
	const casComptageSession: CasUsage<EntreeComptageSession, ComptageEnregistre> = {
		droit: 'compter',
		faire(o, e) {
			const j = o.depots.operations.journal();
			const session = sessionDe(j, e.sessionId);
			if (session === undefined) return echec('element_introuvable');
			if (!autorisee(o.depots, o.ctx, session.compteId)) return echec('acces_refuse');
			if (session.clotureeLe !== null) return echec('session_invalide');
			const compte = caisseDe(j, session.compteId) as Compte;
			const total = totalComptage(e.coupures);
			const ouverture = comptageDe(j, session.id, 'ouverture');
			const fin = comptageDe(j, session.id, 'fin');
			const dernier = dernierComptageSession(j, session.id);

			if (e.corriger !== true && fin === undefined) {
				const date = controlerDate(o, compte.id, e.date, ouverture?.date ?? null);
				if (!date.ok) return date;
				const id = o.depots.caisses.creerComptage({
					compteId: compte.id,
					sessionCaisseId: session.id,
					type: 'fin',
					date: e.date,
					compteLe: o.ctx.maintenant,
					saisiLe: o.ctx.maintenant,
					saisiPar: acteur(o),
					coupures: e.coupures
				});
				recalerPhases(o, session.id, e.date);
				noterComptage(o, compte, id, total, 'comptage.enregistre');
				return succes({ sessionId: session.id, ecart: centimes(0) });
			}

			if (dernier === undefined) return echec('comptage_manquant');
			const auPlusTot =
				dernier.type === 'fin'
					? (ouverture?.date ?? null)
					: dernierComptageDate(j, compte.id, dernier.id);
			const date = controlerDate(o, compte.id, e.date, auPlusTot);
			if (!date.ok) return date;
			let ecart = centimes(0);
			if (dernier.type === 'ouverture') {
				const r = corrigerOuverture(o, compte, dernier, e, total);
				if (!r.ok) return r;
				ecart = r.valeur;
			}
			o.depots.caisses.corrigerComptage(dernier.id, {
				date: e.date,
				saisiLe: o.ctx.maintenant,
				saisiPar: acteur(o),
				coupures: e.coupures
			});
			if (dernier.type === 'fin') recalerPhases(o, session.id, e.date);
			noterComptage(o, compte, dernier.id, total, 'comptage.corrige');
			return succes({ sessionId: session.id, ecart });
		}
	};

	/** C2, C5, C6 : la recette entre dans l'Action sans ressaisie. */
	const casCloture: CasUsage<number, { recette: Centimes; operationId: number | null }> = {
		droit: 'cloturer_session',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const session = sessionDe(j, id);
			if (session === undefined) return echec('element_introuvable');
			if (session.clotureeLe !== null) return echec('session_invalide');
			const termes = termesRecette(j, id);
			const final = comptageDe(j, id, 'fin');
			if (termes === null || final === undefined) return echec('comptage_manquant');
			const compte = caisseDe(j, session.compteId) as Compte;
			const action = o.depots.parametrage.actions().find((a) => a.id === session.actionId);
			let operationId: number | null = null;
			if (termes.recette !== 0) {
				const cree = ecrireOperation(
					o,
					brouillonCaisse(compte.id, final.date, termes.recette, {
						origine: 'recette_especes',
						libelle: `Recette d’espèces, ${compte.libelle}`,
						natureId: natureSysteme(o, 'recette_especes'),
						actionId: session.actionId
					}),
					// O11 ne vise qu'une Ligne nouvelle : l'Action de la Session a pu être désactivée depuis.
					{
						existant: {
							natureIds: [],
							actionIds: session.actionId === null ? [] : [session.actionId]
						}
					}
				);
				if (!cree.ok) return cree;
				operationId = cree.valeur.id;
			}
			o.depots.caisses.cloturerSession(id, o.ctx.maintenant, acteur(o), operationId);
			const pour = action ? ` pour ${action.libelle}` : '';
			o.noter({
				evenement: 'session.cloturee',
				entiteType: 'session_caisse',
				entiteId: id,
				resume: `a clôturé la Session de ${compte.libelle}${pour}, avec une Recette d’espèces de ${formaterMontant(termes.recette)}.`
			});
			return succes({ recette: termes.recette, operationId });
		}
	};

	/** C7 : l'Opération de recette s'annule, la prochaine clôture la recalcule. */
	const casReouverture: CasUsage<number, true> = {
		droit: 'cloturer_session',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const decision = deciderReouverture(j, id);
			if (!decision.ok) return decision;
			const { operationRecetteId, compteId } = decision.valeur;
			if (operationRecetteId !== null) {
				const annule = annulerOperation(o, operationRecetteId, { parSonModule: true });
				if (!annule.ok) return annule;
			}
			o.depots.caisses.rouvrirSession(id);
			o.noter({
				evenement: 'session.rouverte',
				entiteType: 'session_caisse',
				entiteId: id,
				resume: `a rouvert la Session de ${caisseDe(j, compteId)?.libelle ?? 'la caisse'}.`
			});
			return succes(true);
		}
	};

	function ecranOuverture(ctx: Ctx, j: GrandJournal, compte: Compte): EcranComptage {
		const prefill = compte.reserve ? null : prefillOuverture(j, compte.id, ctx.aujourdhui);
		return {
			mode: compte.reserve ? 'controle' : 'ouverture',
			correction: false,
			compteId: compte.id,
			sessionId: null,
			caisse: compte.libelle,
			action: null,
			quantites: prefill?.type === 'repris' ? prefill.coupures : [],
			message:
				prefill?.type === 'repris' ? 'repris' : prefill?.type === 'a_compter' ? 'a_compter' : null,
			actions: compte.reserve
				? []
				: depots.parametrage
						.actions()
						.filter((a) => a.actif && a.avecCaisse)
						.map(({ id, libelle }) => ({ id, libelle })),
			date: ctx.aujourdhui,
			aujourdhui: ctx.aujourdhui
		};
	}

	function ecranSession(
		ctx: Ctx,
		j: GrandJournal,
		sessionId: number,
		corriger: boolean
	): EcranComptage | null {
		const session = sessionDe(j, sessionId);
		const compte = session && caisseDe(j, session.compteId);
		if (!session || !compte || session.clotureeLe !== null) return null;
		const fin = comptageDe(j, sessionId, 'fin');
		// Le Comptage final déjà saisi s'ouvre en correction : il n'y en a qu'un.
		const repris = fin ?? (corriger ? comptageDe(j, sessionId, 'ouverture') : undefined);
		return {
			mode: repris?.type === 'ouverture' ? 'ouverture' : 'fin',
			correction: repris !== undefined,
			compteId: compte.id,
			sessionId,
			caisse: compte.libelle,
			action: depots.parametrage.actions().find((a) => a.id === session.actionId)?.libelle ?? null,
			quantites: repris?.coupures ?? [],
			message: null,
			actions: [],
			date: repris?.date ?? ctx.aujourdhui,
			aujourdhui: ctx.aujourdhui
		};
	}

	return {
		compterCaisse: (ctx: Ctx, e: EntreeComptageCaisse) => executer(casComptageCaisse, ctx, e),
		compterSession: (ctx: Ctx, e: EntreeComptageSession) => executer(casComptageSession, ctx, e),
		cloturer: (ctx: Ctx, id: number) => executer(casCloture, ctx, id),
		rouvrir: (ctx: Ctx, id: number) => executer(casReouverture, ctx, id),

		liste(ctx: Ctx) {
			return lire(ctx, 'consulter_suivi', () =>
				cartesCaisses(depots.operations.journal(), noms(), ctx.aujourdhui)
			);
		},

		detail(ctx: Ctx, id: number) {
			const r = lire(ctx, 'consulter_suivi', () => {
				const j = depots.operations.journal();
				const compte = caisseDe(j, id);
				return compte ? detailCaisse(j, noms(), compte, ctx.aujourdhui) : null;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		session(ctx: Ctx, id: number) {
			const r = lire(ctx, 'consulter_suivi', () =>
				vueSession(depots.operations.journal(), noms(), id)
			);
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Compte proposé par « Déposer en banque » : la première banque active. */
		compteDeDepot(ctx: Ctx) {
			return lire(ctx, 'consulter_suivi', () => {
				const comptes = depots.parametrage.comptes().filter((c) => c.actif);
				return (
					(comptes.find((c) => c.type === 'banque') ?? comptes.find((c) => c.type === 'epargne'))
						?.id ?? null
				);
			});
		},

		sessionsDeLAction(ctx: Ctx, actionId: number, e: Exercice) {
			return lire(ctx, 'consulter', () =>
				e.debut === null || e.fin === null
					? []
					: sessionsDeLAction(depots.operations.journal(), noms(), actionId, e.debut, e.fin)
			);
		},

		/** Rien d'autre que ce que la personne a le droit de compter (A3). */
		mesCaisses(ctx: Ctx) {
			return lire(ctx, 'compter', () => {
				const j = depots.operations.journal();
				const n = noms();
				return j.comptes
					.filter((c) => c.type === 'caisse' && c.actif && autorisee(depots, ctx, c.id))
					.map((c) => rangeeMesCaisses(j, n, c));
			});
		},

		ecranCaisse(ctx: Ctx, compteId: number): Resultat<EcranComptage | { sessionId: number }> {
			const r = lire(ctx, 'compter', () => {
				if (!autorisee(depots, ctx, compteId)) return 'refus' as const;
				const j = depots.operations.journal();
				const compte = caisseDe(j, compteId);
				if (compte === undefined || !compte.actif) return null;
				const ouverte = sessionOuverte(j, compteId);
				return ouverte ? { sessionId: ouverte.id } : ecranOuverture(ctx, j, compte);
			});
			if (!r.ok) return r;
			if (r.valeur === 'refus') return echec('acces_refuse');
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		ecranSession(ctx: Ctx, sessionId: number, corriger: boolean): Resultat<EcranComptage> {
			const r = lire(ctx, 'compter', () => {
				const j = depots.operations.journal();
				const session = sessionDe(j, sessionId);
				if (session === undefined) return null;
				if (!autorisee(depots, ctx, session.compteId)) return 'refus' as const;
				return ecranSession(ctx, j, sessionId, corriger);
			});
			if (!r.ok) return r;
			if (r.valeur === 'refus') return echec('acces_refuse');
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		}
	};
}

export type ModuleCaisses = ReturnType<typeof creerCaisses>;
