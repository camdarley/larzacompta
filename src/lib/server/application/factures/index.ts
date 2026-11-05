/**
 * Seul module qui écrit dans `facture`, `facture_ligne` et `compteur_facture` (AD-7, AD-12).
 * Le PDF se génère avant la transaction, parce que pdfkit est asynchrone et qu'une transaction
 * SQLite ne l'est pas. Le numéro, lui, ne s'attribue que dans la transaction : si la suite a bougé
 * entre-temps, le document se refait avec le bon numéro.
 */
import { totalRegle } from '#lib/domaine/creances/index.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
import type { ModeleDocument } from '#lib/domaine/etats/documents.ts';
import { exerciceDeDate } from '#lib/domaine/etats/soldes.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { modeleFacture } from '#lib/domaine/factures/document.ts';
import {
	deciderAvoir,
	deciderValidation,
	detailEncaissement,
	motifAvoir,
	motifFacture,
	rangerFactures,
	totalFacture,
	type ContexteNumero,
	type DecisionAvoir,
	type DecisionValidation,
	type EntreeFacture,
	type EtatFacture,
	type Facture,
	type IdentiteFacture,
	type RangeeFacture
} from '#lib/domaine/factures/index.ts';
import type { CreanceDetteJ, GrandJournal } from '#lib/domaine/journal.ts';
import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import type { Depots } from '../ports.ts';

/** La suite a avancé pendant la génération du PDF : le document se refait. */
const NUMERO_CHANGE = 'numero_change';
const ESSAIS = 3;

const acteur = (o: Pick<Outils, 'ctx'>) => (o.ctx.acces as NonNullable<Ctx['acces']>).id;

type Encaissement = { reste: Centimes; encaisse: Centimes; creanceId: number | null };

export type VueFacture = {
	facture: Facture;
	total: Centimes;
	etat: EtatFacture;
	/** Ce qui suit l'état à l'écran : encaissement, ou Avoir qui l'annule. */
	detail: string | null;
	encaissement: Encaissement | null;
	avoir: { id: number; numero: string } | null;
	origine: { id: number; numero: string } | null;
	action: string | null;
};

export type TiersConnu = { nom: string; adresse: string };

type Saisie = EntreeFacture;

function contexteNumero(depots: Depots, aujourdhui: DateCivile): ContexteNumero {
	return {
		aujourdhui,
		exercices: depots.exercices.lister(),
		compteurs: depots.factures.compteurs()
	};
}

function creanceDe(j: Pick<GrandJournal, 'creancesDettes'>, f: Facture) {
	return j.creancesDettes.find((c) => c.factureId === f.id && c.sens === 'creance');
}

function encaissementDe(j: GrandJournal, f: Facture, c: CreanceDetteJ | undefined): Encaissement {
	const total = totalFacture(f.lignes);
	if (c === undefined) return { reste: total, encaisse: centimes(0), creanceId: null };
	const encaisse = totalRegle(c, j);
	return { reste: centimes(total - encaisse), encaisse, creanceId: c.id };
}

function etatDe(f: Facture, avoir: Facture | undefined): EtatFacture {
	if (f.type === 'avoir') return 'avoir';
	if (f.numero === null) return 'brouillon';
	return avoir ? 'annulee' : 'validee';
}

function vueDe(
	liste: readonly Facture[],
	j: GrandJournal,
	actions: readonly { id: number; libelle: string }[],
	f: Facture
): VueFacture {
	const avoir = liste.find((x) => x.avoirDeId === f.id);
	const origine = liste.find((x) => x.id === f.avoirDeId);
	const etat = etatDe(f, avoir);
	const encaissement = etat === 'validee' ? encaissementDe(j, f, creanceDe(j, f)) : null;
	const numeroDe = (x: Facture | undefined) =>
		x?.numero === undefined || x.numero === null ? null : { id: x.id, numero: x.numero };
	let detail: string | null = null;
	if (encaissement) detail = detailEncaissement(encaissement);
	else if (etat === 'annulee') detail = `par l’Avoir n° ${avoir?.numero ?? ''}`;
	else if (etat === 'avoir') detail = `sur la facture n° ${origine?.numero ?? ''}`;
	return {
		facture: f,
		total: totalFacture(f.lignes),
		etat,
		detail,
		encaissement,
		avoir: numeroDe(avoir),
		origine: numeroDe(origine),
		action: actions.find((a) => a.id === f.actionId)?.libelle ?? null
	};
}

function rangeeDe(v: VueFacture): RangeeFacture {
	const { facture: f } = v;
	return {
		id: f.id,
		numero: f.numero,
		tiers: f.tiersNom,
		date: f.dateEmission,
		montant: f.type === 'avoir' ? centimes(-v.total) : v.total,
		etat: v.etat,
		detail: v.detail
	};
}

function identiteCourante(depots: Depots): IdentiteFacture {
	const a = depots.parametrage.association();
	return { nom: a?.nom ?? '', adresse: a?.adresse ?? '', mentions: a?.mentionsFacture ?? '' };
}

const libelleExercice = (exercices: readonly Exercice[], date: DateCivile | null) =>
	date === null ? '' : (exerciceDeDate(exercices, date)?.libelle ?? '');

type EntreeValidation = {
	id: number;
	numero: string;
	identite: IdentiteFacture;
	fichierSha256: string;
};

export function creerFactures(socle: Socle, executer: Executer, lire: Lire) {
	const { depots } = socle;
	const journal = () => depots.operations.journal();
	const actions = () => depots.parametrage.actions();

	function controlerAction(o: Outils, e: Saisie, existante: number | null = null) {
		if (e.actionId === null || e.actionId === existante) return succes(true);
		const action = o.depots.parametrage.actions().find((a) => a.id === e.actionId);
		if (action === undefined) return echec('element_introuvable');
		return action.actif ? succes(true) : echec('reference_inactive');
	}

	const casCreer: CasUsage<Saisie, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const action = controlerAction(o, e);
			if (!action.ok) return action;
			const id = o.depots.factures.creer(e, o.ctx.maintenant);
			o.noter({
				evenement: 'facture.brouillon',
				entiteType: 'facture',
				entiteId: id,
				resume: `a préparé un brouillon de facture pour ${e.tiersNom}.`
			});
			return succes({ id });
		}
	};

	const casModifier: CasUsage<{ id: number; saisie: Saisie }, { id: number }> = {
		droit: 'saisir',
		faire(o, { id, saisie }) {
			const f = o.depots.factures.parId(id);
			if (f === null) return echec('element_introuvable');
			if (f.valideLe !== null) return echec('facture_validee');
			const action = controlerAction(o, saisie, f.actionId);
			if (!action.ok) return action;
			o.depots.factures.modifier(id, saisie);
			o.noter({
				evenement: 'facture.brouillon_modifie',
				entiteType: 'facture',
				entiteId: id,
				resume: `a modifié le brouillon de facture pour ${saisie.tiersNom}.`
			});
			return succes({ id });
		}
	};

	const casSupprimer: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const f = o.depots.factures.parId(id);
			if (f === null) return echec('element_introuvable');
			if (f.valideLe !== null) return echec('facture_validee');
			o.depots.factures.supprimer(id);
			o.noter({
				evenement: 'facture.brouillon_supprime',
				entiteType: 'facture',
				entiteId: id,
				resume: `a supprimé le brouillon de facture pour ${f.tiersNom}.`
			});
			return succes(true);
		}
	};

	/** F3 : numéro, gel et Créance dans la même transaction. Un échec ne laisse aucun trou. */
	const casValider: CasUsage<EntreeValidation, { id: number; numero: string }> = {
		droit: 'saisir',
		faire(o, e) {
			const f = o.depots.factures.parId(e.id);
			if (f === null) return echec('element_introuvable');
			const decision = deciderValidation(f, contexteNumero(o.depots, o.ctx.aujourdhui));
			if (!decision.ok) return decision;
			const { numero, annee, rang, date, total } = decision.valeur;
			if (numero !== e.numero) return echec(NUMERO_CHANGE);
			o.depots.factures.avancerCompteur(annee, rang, date);
			o.depots.factures.valider(e.id, {
				numero,
				dateEmission: date,
				identite: e.identite,
				fichierSha256: e.fichierSha256,
				valideLe: o.ctx.maintenant,
				validePar: acteur(o)
			});
			o.depots.creances.creer({
				sens: 'creance',
				tiers: f.tiersNom,
				motif: motifFacture(numero),
				montant: total,
				date,
				actionId: f.actionId,
				note: null,
				creeLe: o.ctx.maintenant,
				creePar: acteur(o),
				factureId: e.id
			});
			o.noter({
				evenement: 'facture.validee',
				entiteType: 'facture',
				entiteId: e.id,
				resume: `a validé la facture n° ${numero} pour ${f.tiersNom}, de ${formaterMontant(total)}.`
			});
			return succes({ id: e.id, numero });
		}
	};

	/** F5 : l'Avoir couvre toute la Facture, annule ce qui reste dû et ouvre la Dette du reste. */
	const casAvoir: CasUsage<EntreeValidation, { id: number; numero: string }> = {
		droit: 'saisir',
		faire(o, e) {
			const f = o.depots.factures.parId(e.id);
			if (f === null) return echec('element_introuvable');
			const decision = deciderAvoirDe(o.depots, f, o.ctx.aujourdhui);
			if (!decision.ok) return decision;
			const { numero, annee, rang, date, detteOuverte } = decision.valeur;
			if (numero !== e.numero) return echec(NUMERO_CHANGE);
			o.depots.factures.avancerCompteur(annee, rang, date);
			const id = o.depots.factures.creerAvoir(
				f.id,
				{ ...f, dateEmission: date },
				{
					numero,
					identite: e.identite,
					fichierSha256: e.fichierSha256,
					valideLe: o.ctx.maintenant,
					validePar: acteur(o)
				}
			);
			const creance = creanceDe(o.depots.operations.journal(), f);
			if (creance) o.depots.creances.annuler(creance.id, o.ctx.maintenant, acteur(o));
			if (detteOuverte > 0) {
				o.depots.creances.creer({
					sens: 'dette',
					tiers: f.tiersNom,
					motif: motifAvoir(numero),
					montant: detteOuverte,
					date,
					actionId: f.actionId,
					note: null,
					creeLe: o.ctx.maintenant,
					creePar: acteur(o),
					factureId: id
				});
			}
			o.noter({
				evenement: 'facture.avoir',
				entiteType: 'facture',
				entiteId: id,
				resume: `a annulé la facture n° ${f.numero} par l’Avoir n° ${numero}.`
			});
			return succes({ id, numero });
		}
	};

	function deciderAvoirDe(d: Depots, f: Facture, aujourdhui: DateCivile): Resultat<DecisionAvoir> {
		const j = d.operations.journal();
		const dejaAnnulee = d.factures.lister().some((x) => x.avoirDeId === f.id);
		const encaisse = encaissementDe(j, f, creanceDe(j, f)).encaisse;
		return deciderAvoir(f, dejaAnnulee, encaisse, contexteNumero(d, aujourdhui));
	}

	function modeleValidation(f: Facture, d: DecisionValidation, identite: IdentiteFacture) {
		return modeleFacture({
			type: 'facture',
			numero: d.numero,
			provisoire: false,
			date: d.date,
			tiersNom: f.tiersNom,
			tiersAdresse: f.tiersAdresse,
			lignes: f.lignes,
			identite,
			exercice: libelleExercice(depots.exercices.lister(), d.date)
		});
	}

	function modeleAvoir(f: Facture, d: DecisionAvoir, identite: IdentiteFacture, essai: boolean) {
		return modeleFacture({
			type: 'avoir',
			numero: essai ? null : d.numero,
			provisoire: essai,
			date: d.date,
			tiersNom: f.tiersNom,
			tiersAdresse: f.tiersAdresse,
			lignes: f.lignes,
			identite,
			exercice: libelleExercice(depots.exercices.lister(), d.date),
			origine: f
		});
	}

	/** Prépare le document, écrit son fichier, puis tente la transaction. La suite peut bouger. */
	async function figer(
		ctx: Ctx,
		cas: CasUsage<EntreeValidation, { id: number; numero: string }>,
		id: number,
		preparer: () => Resultat<{ numero: string; modele: ModeleDocument; identite: IdentiteFacture }>
	): Promise<Resultat<{ id: number; numero: string }>> {
		for (let essai = 0; essai < ESSAIS; essai += 1) {
			const lu = lire(ctx, 'saisir', preparer);
			if (!lu.ok) return lu;
			if (!lu.valeur.ok) return lu.valeur;
			const { numero, modele, identite } = lu.valeur.valeur;
			const octets = await socle.exporteurs.pdf(modele);
			const fichierSha256 = socle.fichiers.ecrire(octets);
			const r = executer(cas, ctx, { id, numero, identite, fichierSha256 });
			if (r.ok || r.erreur.code !== NUMERO_CHANGE) return r;
		}
		return echec('modification_concurrente');
	}

	const detail = (id: number): VueFacture | null => {
		const liste = depots.factures.lister();
		const f = liste.find((x) => x.id === id);
		return f ? vueDe(liste, journal(), actions(), f) : null;
	};

	function brouillonOuValidee(id: number): Resultat<Facture> {
		const f = depots.factures.parId(id);
		return f === null ? echec('element_introuvable') : succes(f);
	}

	return {
		creer: (ctx: Ctx, e: Saisie) => executer(casCreer, ctx, e),
		modifier: (ctx: Ctx, id: number, saisie: Saisie) => executer(casModifier, ctx, { id, saisie }),
		supprimer: (ctx: Ctx, id: number) => executer(casSupprimer, ctx, id),

		valider(ctx: Ctx, id: number) {
			return figer(ctx, casValider, id, () => {
				const f = brouillonOuValidee(id);
				if (!f.ok) return f;
				const d = deciderValidation(f.valeur, contexteNumero(depots, ctx.aujourdhui));
				if (!d.ok) return d;
				const identite = identiteCourante(depots);
				return succes({
					numero: d.valeur.numero,
					modele: modeleValidation(f.valeur, d.valeur, identite),
					identite
				});
			});
		},

		creerAvoir(ctx: Ctx, id: number) {
			return figer(ctx, casAvoir, id, () => {
				const f = brouillonOuValidee(id);
				if (!f.ok) return f;
				const d = deciderAvoirDe(depots, f.valeur, ctx.aujourdhui);
				if (!d.ok) return d;
				const identite = identiteCourante(depots);
				return succes({
					numero: d.valeur.numero,
					modele: modeleAvoir(f.valeur, d.valeur, identite, false),
					identite
				});
			});
		},

		/** Les brouillons sans date restent visibles quel que soit l'Exercice regardé. */
		liste(ctx: Ctx, e: Exercice | null): Resultat<RangeeFacture[]> {
			return lire(ctx, 'saisir', () => {
				const liste = depots.factures.lister();
				const j = journal();
				const a = actions();
				const dans = (f: Facture) =>
					f.numero === null ||
					e === null ||
					e.debut === null ||
					e.fin === null ||
					(f.dateEmission !== null && f.dateEmission >= e.debut && f.dateEmission <= e.fin);
				return rangerFactures(liste.filter(dans)).map((f) => rangeeDe(vueDe(liste, j, a, f)));
			});
		},

		/** Aucune Facture du tout : l'état vide. Sinon, c'est seulement l'Exercice qui est vide. */
		existe(ctx: Ctx): Resultat<boolean> {
			return lire(ctx, 'saisir', () => depots.factures.lister().length > 0);
		},

		detail(ctx: Ctx, id: number): Resultat<VueFacture> {
			const r = lire(ctx, 'saisir', () => detail(id));
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Le numéro annoncé par le `dialogue`, sans rien réserver. Un refus se dit dès ici. */
		controlerValidation(ctx: Ctx, id: number): Resultat<{ numero: string; total: Centimes }> {
			const r = lire(ctx, 'saisir', () => {
				const f = brouillonOuValidee(id);
				if (!f.ok) return f;
				const d = deciderValidation(f.valeur, contexteNumero(depots, ctx.aujourdhui));
				return d.ok ? succes({ numero: d.valeur.numero, total: d.valeur.total }) : d;
			});
			return r.ok ? r.valeur : r;
		},

		/** Les tiers déjà facturés : leur adresse se reprend sans ressaisie. */
		tiers(ctx: Ctx): Resultat<TiersConnu[]> {
			return lire(ctx, 'saisir', () => {
				const connus = new Map<string, TiersConnu>();
				for (const f of depots.factures.lister()) {
					connus.set(f.tiersNom, { nom: f.tiersNom, adresse: f.tiersAdresse });
				}
				return [...connus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
			});
		},

		/** Aperçu d'une saisie, enregistrée ou non : aucun numéro, le filigrane « Provisoire ». */
		apercu(ctx: Ctx, e: Saisie): Resultat<ModeleDocument> {
			return lire(ctx, 'saisir', () =>
				modeleFacture({
					type: 'facture',
					numero: null,
					provisoire: true,
					date: e.dateEmission,
					tiersNom: e.tiersNom,
					tiersAdresse: e.tiersAdresse,
					lignes: e.lignes,
					identite: identiteCourante(depots),
					exercice: libelleExercice(depots.exercices.lister(), e.dateEmission)
				})
			);
		},

		/** Ce que l'Avoir ferait : l'écran le montre avant confirmation (F5). */
		apercuAvoir(ctx: Ctx, id: number): Resultat<DecisionAvoir & { modele: ModeleDocument }> {
			const r = lire(ctx, 'saisir', () => {
				const f = brouillonOuValidee(id);
				if (!f.ok) return f;
				const d = deciderAvoirDe(depots, f.valeur, ctx.aujourdhui);
				if (!d.ok) return d;
				const identite = identiteCourante(depots);
				return succes({ ...d.valeur, modele: modeleAvoir(f.valeur, d.valeur, identite, true) });
			});
			return r.ok ? r.valeur : r;
		},

		/** F7 : le PDF d'une Facture validée est servi tel quel. Un brouillon n'en a pas encore. */
		fichier(ctx: Ctx, id: number): Resultat<{ octets: Uint8Array; nom: string }> {
			const r = lire(ctx, 'saisir', () => {
				const f = depots.factures.parId(id);
				if (f?.fichierSha256 == null) return null;
				const octets = socle.fichiers.lire(f.fichierSha256);
				const nom = f.type === 'avoir' ? 'avoir' : 'facture';
				return octets ? { octets, nom: `${nom}-${f.numero}.pdf` } : null;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		}
	};
}

export type ModuleFactures = ReturnType<typeof creerFactures>;
