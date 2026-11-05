/**
 * Seul module qui écrit dans `creance_dette` et `reglement` (AD-7, AD-12).
 * Une somme ne produit aucune Ligne : seule l'Opération qui la solde touche résultat et trésorerie.
 */
import {
	deciderCreance,
	deciderReglements,
	deciderRetablissement,
	sommeASolder,
	suivi,
	type EntreeCreance,
	type ExerciceClos,
	type PartReglement,
	type SommeASolder,
	type SuiviCreances
} from '#lib/domaine/creances/index.ts';
import { formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import { dateProposee } from '#lib/domaine/operations/lecture.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { CasUsage, Ctx, Executer, Lire, Socle } from '../executer.ts';
import { ecrireOperation, versBrouillon, type EntreeOperation } from '../operations/index.ts';
import { rattacherPieces } from '../pieces/index.ts';

export type EntreeSolder = {
	parts: PartReglement[];
	saisie: Extract<EntreeOperation, { forme: 'standard' }>;
	pieces?: number[];
	cle?: string;
};

/** Exercices clôturés, avec l'instant de leur clôture. */
function closes(depot: Socle['depots']['exercices']): ExerciceClos[] {
	return depot.lister().flatMap((e) => {
		const clotureLe = e.statut === 'cloture' ? depot.cloture(e.id)?.clotureLe : undefined;
		return clotureLe === undefined ? [] : [{ ...e, clotureLe }];
	});
}

const nomSomme = (sens: EntreeCreance['sens']) => (sens === 'creance' ? 'la Créance' : 'la Dette');

export function creerCreances(socle: Socle, executer: Executer, lire: Lire) {
	const depots = socle.depots;

	const casAjouter: CasUsage<EntreeCreance, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const decision = deciderCreance(e, o.depots.exercices.lister());
			if (!decision.ok) return decision;
			const acces = o.ctx.acces as NonNullable<Ctx['acces']>;
			const id = o.depots.creances.creer({ ...e, creeLe: o.ctx.maintenant, creePar: acces.id });
			o.noter({
				evenement: 'creance.creee',
				entiteType: 'creance_dette',
				entiteId: id,
				resume: `a enregistré ${nomSomme(e.sens)} « ${e.tiers}, ${e.motif} » de ${formaterMontant(e.montant)}.`,
				apres: e
			});
			return succes({ id });
		}
	};

	const trouver = (id: number) =>
		depots.operations.journal().creancesDettes.find((c) => c.id === id);

	const casAnnuler: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const c = trouver(id);
			if (c === undefined) return echec('element_introuvable');
			if (c.annuleeLe !== null) return echec('creance_annulee');
			o.depots.creances.annuler(
				id,
				o.ctx.maintenant,
				(o.ctx.acces as NonNullable<Ctx['acces']>).id
			);
			o.noter({
				evenement: 'creance.annulee',
				entiteType: 'creance_dette',
				entiteId: id,
				resume: `a annulé ${nomSomme(c.sens)} « ${c.tiers}, ${c.motif} ».`
			});
			return succes(true);
		}
	};

	const casRetablir: CasUsage<number, true> = {
		droit: 'saisir',
		// Rétablir une somme déjà rétablie (deux clics sur « Annuler ») n'écrit rien.
		sansJournal: true,
		faire(o, id) {
			const c = trouver(id);
			if (c === undefined) return echec('element_introuvable');
			if (c.annuleeLe === null) return succes(true);
			const permis = deciderRetablissement(c, closes(o.depots.exercices));
			if (!permis.ok) return permis;
			o.depots.creances.retablir(id);
			o.noter({
				evenement: 'creance.retablie',
				entiteType: 'creance_dette',
				entiteId: id,
				resume: `a rétabli ${nomSomme(c.sens)} « ${c.tiers}, ${c.motif} ».`
			});
			return succes(true);
		}
	};

	/** Opération et `reglement` dans la même transaction : l'une ne va pas sans l'autre. */
	const casSolder: CasUsage<EntreeSolder, { id: number }> = {
		droit: 'saisir',
		faire(o, e) {
			const brouillon = versBrouillon(e.saisie);
			const montant = brouillon.cotes[0]?.montant;
			if (montant === undefined) return echec('forme_invalide');
			const decision = deciderReglements(e.parts, montant, o.depots.operations.journal());
			if (!decision.ok) return decision;

			const cree = ecrireOperation(o, brouillon, { cle: e.cle });
			if (!cree.ok) return cree;

			const { creancesDettes } = o.depots.operations.journal();
			for (const part of e.parts) {
				o.depots.creances.regler(part.creanceId, cree.valeur.id, part.montant);
				const c = creancesDettes.find((x) => x.id === part.creanceId);
				o.noter({
					evenement: 'creance.reglee',
					entiteType: 'creance_dette',
					entiteId: part.creanceId,
					resume: `a réglé ${formaterMontant(part.montant)} sur « ${c?.tiers}, ${c?.motif} ».`,
					apres: { operationId: cree.valeur.id, montant: part.montant }
				});
			}
			const pieces = rattacherPieces(o, e.pieces ?? [], cree.valeur.id);
			return pieces.ok ? cree : pieces;
		}
	};

	return {
		ajouter: (ctx: Ctx, e: EntreeCreance) => executer(casAjouter, ctx, e),
		annuler: (ctx: Ctx, id: number) => executer(casAnnuler, ctx, id),
		retablir: (ctx: Ctx, id: number) => executer(casRetablir, ctx, id),

		solder(ctx: Ctx, e: EntreeSolder): Resultat<{ id: number }> {
			// Un renvoi après une coupure ne règle pas deux fois.
			const lu = lire(ctx, 'saisir', () =>
				e.cle === undefined ? null : depots.journal.entiteDeCle(e.cle)
			);
			if (!lu.ok) return lu;
			return lu.valeur === null ? executer(casSolder, ctx, e) : succes({ id: lu.valeur });
		},

		/**
		 * Reste dû à la fin de l'Exercice regardé : tout ce qui est né et tout ce qui est payé dans
		 * cet Exercice y est, et un Exercice passé garde ses chiffres.
		 */
		suivi(ctx: Ctx, exercice: Exercice | null): Resultat<SuiviCreances> {
			return lire(ctx, 'consulter_suivi', () =>
				suivi(
					depots.operations.journal(),
					depots.parametrage.actions(),
					exercice?.fin ?? dateProposee(ctx.aujourdhui, exercice),
					exercice ? (depots.exercices.cloture(exercice.id)?.clotureLe ?? null) : null
				)
			);
		},

		aSolder(ctx: Ctx, id: number): Resultat<SommeASolder> {
			const r = lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				const c = j.creancesDettes.find((x) => x.id === id);
				return c ? sommeASolder(c, j, ctx.aujourdhui) : null;
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Les sommes qu'une même Opération peut solder aussi. */
		ouvertes(ctx: Ctx): Resultat<SommeASolder[]> {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				return j.creancesDettes.flatMap((c) => {
					const s = sommeASolder(c, j, ctx.aujourdhui);
					return s ? [s] : [];
				});
			});
		},

		/** Sommes reprises à l'assistant : toutes celles d'avant le premier Exercice tenu. */
		reprises(ctx: Ctx, avant: string): Resultat<(SommeASolder & { montant: Centimes })[]> {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				return j.creancesDettes.flatMap((c) => {
					if (c.date > avant) return [];
					const s = sommeASolder(c, j, ctx.aujourdhui);
					return s ? [{ ...s, montant: c.montant }] : [];
				});
			});
		}
	};
}

export type ModuleCreances = ReturnType<typeof creerCreances>;
