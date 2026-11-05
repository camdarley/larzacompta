/** Corriger ou annuler sans effacer l'histoire (FR-41, O7 à O10). */
import { echec, succes, type Resultat } from '../resultat.ts';
import type { Exercice } from '../exercices.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type { OperationJ } from '../journal.ts';
import type { Brouillon } from './validation.ts';

/** O9 : ces origines se modifient par leur module. La saisie générique s'y limite au texte. */
export function estSpecialisee(op: Pick<OperationJ, 'origine'>): boolean {
	return op.origine !== 'saisie' && op.origine !== 'ajustement';
}

/** Exercice clôturé qui fige l'Opération : sa date, ou la date d'un de ses Côtés. */
export function exerciceFigeant(
	op: Pick<OperationJ, 'date' | 'cotes'>,
	exercices: readonly Exercice[]
): Exercice | undefined {
	const dates = [op.date, ...op.cotes.map((c) => c.date)];
	return dates
		.map((d) => exerciceDeDate(exercices, d))
		.find((e): e is Exercice => e?.statut === 'cloture');
}

/**
 * O7 : les Lignes rattachées à l'ancien Exercice courant suivent l'Opération.
 * Les rattachements antérieurs restent.
 */
export function deplacerRattachements<L extends { exerciceRattachementId: number | null }>(
	lignes: readonly L[],
	ancienId: number | undefined,
	nouveauId: number | undefined
): L[] {
	if (ancienId === undefined || nouveauId === undefined || ancienId === nouveauId) {
		return [...lignes];
	}
	return lignes.map((l) =>
		l.exerciceRattachementId === ancienId ? { ...l, exerciceRattachementId: nouveauId } : l
	);
}

function memeAnalytique(avant: OperationJ, apres: Brouillon) {
	const lignes = (l: readonly (typeof apres.lignes)[number][]) =>
		JSON.stringify(
			l.map((x) => [x.montant, x.estReduction, x.natureId, x.actionId, x.note ?? null])
		);
	const cotes = (c: readonly (typeof apres.cotes)[number][]) =>
		JSON.stringify(c.map((x) => [x.compteId, x.date, x.montant]));
	return (
		avant.date === apres.date &&
		avant.reference === apres.reference &&
		avant.modePaiement === apres.modePaiement &&
		avant.tiers === apres.tiers &&
		lignes(avant.lignes) === lignes(apres.lignes) &&
		cotes(avant.cotes) === cotes(apres.cotes)
	);
}

export type ContexteCorrection = {
	versionLue: number;
	coteIdsPointes: readonly number[];
	exercices: readonly Exercice[];
	/** Le module propriétaire d'une Opération spécialisée (O9), et lui seul. */
	parSonModule?: boolean;
};

export function deciderModification(
	avant: OperationJ,
	apres: Brouillon,
	ctx: ContexteCorrection
): Resultat<Brouillon> {
	if (avant.annuleeLe !== null) return echec('operation_annulee');
	// O10 : d'abord, pour que les changements restent affichés avec le bon message.
	if (avant.version !== ctx.versionLue) return echec('modification_concurrente');
	if (avant.genre !== apres.genre) return echec('forme_invalide');

	const fige = exerciceFigeant(avant, ctx.exercices);
	if (fige) return echec('exercice_cloture', { exercice: fige.libelle });

	if (estSpecialisee(avant) && !ctx.parSonModule && !memeAnalytique(avant, apres)) {
		return echec('operation_geree_ailleurs');
	}

	for (const [i, cote] of avant.cotes.entries()) {
		if (!ctx.coteIdsPointes.includes(cote.id)) continue;
		const nouveau = apres.cotes[i];
		if (nouveau?.montant !== cote.montant || nouveau.compteId !== cote.compteId) {
			return echec('cote_pointe');
		}
	}

	return succes({
		...apres,
		origine: avant.origine,
		sansPiece: avant.sansPiece,
		lignes: deplacerRattachements(
			apres.lignes,
			exerciceDeDate(ctx.exercices, avant.date)?.id,
			exerciceDeDate(ctx.exercices, apres.date)?.id
		)
	});
}

export function deciderAnnulation(
	op: OperationJ,
	ctx: Omit<ContexteCorrection, 'versionLue'> & { parSonModule?: boolean }
): Resultat<true> {
	if (op.annuleeLe !== null) return echec('operation_annulee');
	const fige = exerciceFigeant(op, ctx.exercices);
	if (fige) return echec('exercice_cloture', { exercice: fige.libelle });
	if (estSpecialisee(op) && !ctx.parSonModule) return echec('operation_geree_ailleurs');
	// O8 : une Opération annulée ne porte aucun Côté pointé.
	if (op.cotes.some((c) => ctx.coteIdsPointes.includes(c.id))) return echec('cote_pointe');
	return succes(true);
}
