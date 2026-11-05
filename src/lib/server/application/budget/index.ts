/**
 * Budget (FR-29). Seule exception au Journal (AD-7) : un Budget n'est pas une donnée comptable.
 * Le droit, la transaction et la décision restent ceux de toute mutation, par `executer()`.
 */
import {
	lignesDepuisRealise,
	realiseDe,
	vueBudget,
	type LigneBudget
} from '#lib/domaine/budget/index.ts';
import { modeleBudget } from '#lib/domaine/budget/document.ts';
import { compteDeResultat } from '#lib/domaine/etats/resultat.ts';
import { exercicePrecedent, type Exercice } from '#lib/domaine/exercices.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { EntreeLigneBudget } from '#lib/schemas/budget.ts';
import { parametrageDe } from '../etats/index.ts';
import type { CasUsage, Ctx, Executer, Lire, Socle } from '../executer.ts';
import type { Depots } from '../ports.ts';

type DepotsBudget = Pick<Depots, 'budget' | 'parametrage' | 'exercices'>;

function realiseDeLExercice(depots: DepotsBudget, j: GrandJournal, e: Exercice): LigneBudget[] {
	return realiseDe(compteDeResultat(j, e, parametrageDe(depots, e)));
}

const actifs = (depots: DepotsBudget) => ({
	actions: new Set(
		depots.parametrage
			.actions()
			.filter((a) => a.actif)
			.map((a) => a.id)
	),
	natures: new Set(
		depots.parametrage
			.natures()
			.filter((n) => n.actif && !n.neutre)
			.map((n) => n.id)
	)
});

/** Ce que « Repartir du réalisé » reprendrait, et d'où. `null` : rien à reprendre. */
function depart(depots: DepotsBudget, j: GrandJournal, e: Exercice) {
	const precedent = exercicePrecedent(j.exercices, e);
	if (precedent === null) return null;
	const lignes = lignesDepuisRealise(realiseDeLExercice(depots, j, precedent), actifs(depots));
	return lignes.length === 0 ? null : { libelle: precedent.libelle, lignes };
}

export function creerBudget(socle: Socle, executer: Executer, lire: Lire) {
	const { depots } = socle;

	const vueDe = (j: GrandJournal, e: Exercice) =>
		vueBudget({
			prevus: depots.budget.lignes(e.id),
			realise: realiseDeLExercice(depots, j, e),
			parametrage: parametrageDe(depots, e)
		});

	function exerciceOuvert(o: { depots: DepotsBudget }, id: number): Resultat<Exercice> {
		const e = o.depots.exercices.lister().find((x) => x.id === id);
		if (e === undefined || e.statut === 'repere') return echec('element_introuvable');
		return e.statut === 'cloture' ? echec('budget_cloture') : succes(e);
	}

	const casEnregistrer: CasUsage<EntreeLigneBudget, { montant: number | null }> = {
		droit: 'saisir',
		sansJournal: true,
		faire(o, { exerciceId, montant, ...position }) {
			const e = exerciceOuvert(o, exerciceId);
			if (!e.ok) return e;
			if (montant === null) {
				o.depots.budget.retirer(exerciceId, position);
				return succes({ montant });
			}
			const { actionId, natureId } = position;
			const action = o.depots.parametrage.actions().find((a) => a.id === actionId);
			const nature = o.depots.parametrage.natures().find((n) => n.id === natureId);
			if (nature === undefined || nature.neutre || (actionId !== null && action === undefined)) {
				return echec('element_introuvable');
			}
			o.depots.budget.enregistrer(exerciceId, { ...position, montant });
			return succes({ montant });
		}
	};

	const casRepartir: CasUsage<number, { lignes: number; depuis: string }> = {
		droit: 'saisir',
		sansJournal: true,
		faire(o, exerciceId) {
			const e = exerciceOuvert(o, exerciceId);
			if (!e.ok) return e;
			if (o.depots.budget.lignes(exerciceId).length > 0) return echec('budget_deja_prepare');
			const reprise = depart(o.depots, o.depots.operations.journal(), e.valeur);
			if (reprise === null) return echec('budget_sans_realise');
			for (const l of reprise.lignes) o.depots.budget.enregistrer(exerciceId, l);
			return succes({ lignes: reprise.lignes.length, depuis: reprise.libelle });
		}
	};

	return {
		/** Ce que l'écran recalcule à chaque frappe validée, sans repasser par le serveur. */
		ecran(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				const p = parametrageDe(depots, e);
				const modifiable = e.statut === 'ouvert';
				const courants = depots.parametrage;
				return {
					lignes: depots.budget.lignes(e.id),
					realise: realiseDeLExercice(depots, j, e),
					parametrage: { groupes: p.groupes, actions: p.actions, natures: p.natures },
					modifiable,
					// Tout se prévoit, même ce qui n'a encore aucun mouvement.
					vides: modifiable
						? [
								...courants
									.actions()
									.filter((a) => a.actif)
									.map((a) => a.id),
								null
							]
						: [],
					natures: courants
						.natures()
						.filter((n) => n.actif && !n.neutre)
						.map(({ id, libelle }) => ({ id, libelle }))
						.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
					depart: modifiable ? (depart(depots, j, e)?.libelle ?? null) : null
				};
			});
		},

		/** Page d'Action : le même calcul, réduit à cette Action. */
		action(ctx: Ctx, e: Exercice, actionId: number) {
			return lire(ctx, 'saisir', () => {
				const bloc = vueDe(depots.operations.journal(), e).blocs.find(
					(b) => b.actionId === actionId
				);
				return bloc && bloc.rangees.some((r) => r.prevu !== null) ? bloc : null;
			});
		},

		modele(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'saisir', () =>
				modeleBudget(
					vueDe(depots.operations.journal(), e),
					e,
					depots.parametrage.association()?.nom ?? ''
				)
			);
		},

		enregistrer: (ctx: Ctx, entree: EntreeLigneBudget) => executer(casEnregistrer, ctx, entree),
		repartir: (ctx: Ctx, exerciceId: number) => executer(casRepartir, ctx, exerciceId)
	};
}

export type ModuleBudget = ReturnType<typeof creerBudget>;
