/** Seul module qui écrit dans `cheque_recu`, `cheque_emis` et `remise` (AD-7, AD-11). */
import {
	brouillonChequeRecu,
	brouillonRejet,
	brouillonRemise,
	compteCheques,
	deciderAnnulationRemise,
	deciderModificationCheque,
	deciderRejet,
	deciderRemise,
	montantRecu,
	numeroInscrit,
	rejetDe,
	type DemandeRemise,
	type SaisieChequeRecu
} from '#lib/domaine/cheques/index.ts';
import { modeleBordereau } from '#lib/domaine/cheques/bordereau.ts';
import {
	vueChequeRecu,
	vueEmis,
	vueNouvelleRemise,
	vueRecus,
	vueRemise,
	vueRemises,
	type FicheChequeRecu
} from '#lib/domaine/cheques/vues.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
import type { ModeleDocument } from '#lib/domaine/etats/documents.ts';
import { exerciceDeDate } from '#lib/domaine/etats/soldes.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import { sommeCentimes } from '#lib/domaine/montant.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';
import { annulerOperation, ecrireModification, ecrireOperation } from '../operations/index.ts';

export type EntreeChequeRecu = SaisieChequeRecu & { cle?: string };
export type EntreeModificationCheque = SaisieChequeRecu & { id: number; version: number };
export type EntreeRemise = DemandeRemise;
export type EntreeRejet = { id: number; date: DateCivile };
export type EntreeFormule = { numero: string; beneficiaire: string | null };

const acteur = (o: Outils) => (o.ctx.acces as NonNullable<Ctx['acces']>).id;

const nomsDe = (o: Pick<Outils, 'depots'>) => ({
	actions: o.depots.parametrage.actions(),
	comptes: o.depots.parametrage.comptes()
});

function chequeDe(j: GrandJournal, id: number) {
	return j.chequesRecus.find((c) => c.id === id);
}

export function creerCheques(socle: Socle, executer: Executer, lire: Lire) {
	const depots = socle.depots;
	const journal = () => depots.operations.journal();

	const casRecu: CasUsage<EntreeChequeRecu, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const compte = compteCheques(o.depots.operations.journal());
			if (compte === undefined) return echec('element_introuvable');
			const cree = ecrireOperation(o, brouillonChequeRecu(e, compte.id), { cle: e.cle });
			if (!cree.ok) return cree;
			const id = o.depots.cheques.creerRecu({
				operationId: cree.valeur.id,
				emetteur: e.emetteur,
				banque: e.banque,
				numero: e.numero
			});
			return succes({ id });
		}
	};

	const casModifierRecu: CasUsage<EntreeModificationCheque, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const j = o.depots.operations.journal();
			const cheque = chequeDe(j, e.id);
			const compte = compteCheques(j);
			if (cheque === undefined || compte === undefined) return echec('element_introuvable');
			const decision = deciderModificationCheque(j, cheque);
			if (!decision.ok) return decision;
			const fait = ecrireModification(
				o,
				{ id: cheque.operationId, version: e.version },
				brouillonChequeRecu(e, compte.id),
				{ parSonModule: true }
			);
			if (!fait.ok) return fait;
			o.depots.cheques.modifierRecu(e.id, {
				emetteur: e.emetteur,
				banque: e.banque,
				numero: e.numero
			});
			return succes({ id: e.id });
		}
	};

	const casAnnulerRecu: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const cheque = chequeDe(j, id);
			if (cheque === undefined) return echec('element_introuvable');
			const decision = deciderModificationCheque(j, cheque);
			if (!decision.ok) return decision;
			const fait = annulerOperation(o, cheque.operationId, { parSonModule: true });
			return fait.ok ? succes(true) : fait;
		}
	};

	const casRemise: CasUsage<EntreeRemise, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const j = o.depots.operations.journal();
			const compte = compteCheques(j);
			if (compte === undefined) return echec('element_introuvable');
			const decision = deciderRemise(j, e);
			if (!decision.ok) return decision;
			const cheques = decision.valeur;
			const numero = o.depots.cheques.dernierNumeroRemise() + 1;
			const cree = ecrireOperation(
				o,
				brouillonRemise({
					numero,
					nombre: cheques.length,
					depuisId: compte.id,
					versId: e.compteId,
					date: e.date,
					total: sommeCentimes(cheques.map((c) => montantRecu(j, c)))
				})
			);
			if (!cree.ok) return cree;
			const id = o.depots.cheques.creerRemise({ numero, operationId: cree.valeur.id });
			for (const c of cheques) o.depots.cheques.remettre(c.id, id);
			return succes({ id });
		}
	};

	const casAnnulerRemise: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const remise = j.remises.find((r) => r.id === id);
			if (remise === undefined) return echec('element_introuvable');
			const decision = deciderAnnulationRemise(j, remise);
			if (!decision.ok) return decision;
			const fait = annulerOperation(o, remise.operationId, { parSonModule: true });
			if (!fait.ok) return fait;
			o.depots.cheques.liberer(id);
			return succes(true);
		}
	};

	const casRejet: CasUsage<EntreeRejet, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const j = o.depots.operations.journal();
			const cheque = chequeDe(j, e.id);
			if (cheque === undefined) return echec('element_introuvable');
			const decision = deciderRejet(j, j.exercices, cheque, e.date);
			if (!decision.ok) return decision;
			const { operation } = decision.valeur;
			const cree = ecrireOperation(o, brouillonRejet(cheque, decision.valeur), {
				// La Nature ou l'Action de l'origine a pu être désactivée depuis (O11).
				existant: {
					natureIds: operation.lignes.map((l) => l.natureId),
					actionIds: operation.lignes.flatMap((l) => (l.actionId === null ? [] : [l.actionId]))
				}
			});
			if (!cree.ok) return cree;
			o.depots.cheques.definirRejet(e.id, cree.valeur.id);
			return succes({ id: cree.valeur.id });
		}
	};

	const casAnnulerRejet: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const j = o.depots.operations.journal();
			const cheque = chequeDe(j, id);
			const rejet = cheque && rejetDe(j, cheque);
			if (cheque === undefined || rejet === undefined) return echec('element_introuvable');
			const fait = annulerOperation(o, rejet.id, { parSonModule: true });
			if (!fait.ok) return fait;
			o.depots.cheques.definirRejet(id, null);
			return succes(true);
		}
	};

	/** Formule abîmée ou perdue : elle reste au registre, sans paiement (FR-23). */
	const casFormule: CasUsage<EntreeFormule, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			if (numeroInscrit(o.depots.operations.journal(), e.numero)) {
				return echec('numero_cheque_utilise', { champ: 'numero' });
			}
			const id = o.depots.cheques.creerEmis({
				numero: e.numero,
				beneficiaire: e.beneficiaire ?? 'Formule annulée',
				operationId: null,
				annuleLe: o.ctx.maintenant,
				annulePar: acteur(o)
			});
			o.noter({
				evenement: 'cheque_emis.annule',
				entiteType: 'cheque_emis',
				entiteId: id,
				resume: `a annulé la formule de chèque n° ${e.numero}.`,
				apres: e
			});
			return succes({ id });
		}
	};

	function modeleDe(j: GrandJournal, id: number): ModeleDocument | null {
		const remise = j.remises.find((r) => r.id === id);
		if (remise === undefined) return null;
		const op =
			j.operations.find((o) => o.id === remise.operationId) ??
			j.operationsAnnulees.find((o) => o.id === remise.operationId);
		if (op === undefined) return null;
		return modeleBordereau(j, remise, {
			association: depots.parametrage.association()?.nom ?? '',
			exercice: exerciceDeDate(j.exercices, op.date)?.libelle ?? '',
			comptes: depots.parametrage.comptes()
		});
	}

	return {
		enregistrerRecu(ctx: Ctx, e: EntreeChequeRecu): Resultat<{ id: number }> {
			const lu = lire(ctx, 'saisir', () =>
				e.cle === undefined ? null : depots.journal.entiteDeCle(e.cle)
			);
			if (!lu.ok) return lu;
			return lu.valeur === null ? executer(casRecu, ctx, e) : succes({ id: lu.valeur });
		},
		modifierRecu: (ctx: Ctx, e: EntreeModificationCheque) => executer(casModifierRecu, ctx, e),
		annulerRecu: (ctx: Ctx, id: number) => executer(casAnnulerRecu, ctx, id),
		creerRemise: (ctx: Ctx, e: EntreeRemise) => executer(casRemise, ctx, e),
		annulerRemise: (ctx: Ctx, id: number) => executer(casAnnulerRemise, ctx, id),
		rejeter: (ctx: Ctx, e: EntreeRejet) => executer(casRejet, ctx, e),
		annulerRejet: (ctx: Ctx, id: number) => executer(casAnnulerRejet, ctx, id),
		annulerFormule: (ctx: Ctx, e: EntreeFormule) => executer(casFormule, ctx, e),

		recus(ctx: Ctx) {
			return lire(ctx, 'consulter_suivi', () => vueRecus(journal(), nomsDe({ depots })));
		},
		fiche(ctx: Ctx, id: number): Resultat<FicheChequeRecu> {
			const r = lire(ctx, 'consulter_suivi', () => {
				const j = journal();
				const c = chequeDe(j, id);
				return c ? vueChequeRecu(j, c) : null;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},
		remises(ctx: Ctx) {
			return lire(ctx, 'consulter_suivi', () => vueRemises(journal(), nomsDe({ depots })));
		},
		nouvelleRemise(ctx: Ctx) {
			return lire(ctx, 'saisir', () => vueNouvelleRemise(journal(), nomsDe({ depots })));
		},
		remise(ctx: Ctx, id: number) {
			const r = lire(ctx, 'consulter_suivi', () => {
				const j = journal();
				const remise = j.remises.find((x) => x.id === id);
				return remise ? vueRemise(j, remise, nomsDe({ depots })) : null;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},
		emis(ctx: Ctx) {
			return lire(ctx, 'consulter_suivi', () => vueEmis(journal(), nomsDe({ depots })));
		},
		/** Modèle déjà calculé, remis au rendu (AD-18). */
		bordereau(ctx: Ctx, id: number): Resultat<ModeleDocument> {
			const r = lire(ctx, 'consulter_suivi', () => modeleDe(journal(), id));
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		}
	};
}

export type ModuleCheques = ReturnType<typeof creerCheques>;
