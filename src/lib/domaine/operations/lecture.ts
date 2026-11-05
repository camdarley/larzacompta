/** Ce qu'une Opération montre à l'écran. Son montant n'est stocké nulle part (AD-3). */
import type { DateCivile } from '../dates.ts';
import type { GrandJournal, OperationJ } from '../journal.ts';
import { centimes, type Centimes } from '../montant.ts';
import type { Intention } from './formes.ts';

/** Signé : `+` entre, `-` sort. Un Mouvement interne se lit sans signe, une compensée par son différentiel. */
export function montantOperation(op: Pick<OperationJ, 'genre' | 'cotes'>): Centimes {
	const premier = op.cotes[0]?.montant ?? centimes(0);
	return op.genre === 'interne' ? centimes(Math.abs(premier)) : premier;
}

export function intentionDe(op: Pick<OperationJ, 'cotes'>): Intention {
	return (op.cotes[0]?.montant ?? 0) < 0 ? 'depense' : 'recette';
}

/** Côtés pointés d'une Opération. L'état Pointé se déduit toujours du Pointage (AD-8). */
export function cotesPointes(j: Pick<GrandJournal, 'pointages'>, op: Pick<OperationJ, 'cotes'>) {
	const pointes = new Set(j.pointages.flatMap((p) => p.coteIds));
	return op.cotes.filter((c) => pointes.has(c.id)).map((c) => c.id);
}

export function estPointee(j: Pick<GrandJournal, 'pointages'>, op: Pick<OperationJ, 'cotes'>) {
	return cotesPointes(j, op).length > 0;
}

/** Date proposée à l'ouverture du panneau : aujourd'hui, ramené dans l'Exercice regardé. */
export function dateProposee(
	aujourdhui: DateCivile,
	exercice: { debut: DateCivile | null; fin: DateCivile | null } | null
): DateCivile {
	if (exercice?.debut && aujourdhui < exercice.debut) return exercice.debut;
	if (exercice?.fin && aujourdhui > exercice.fin) return exercice.fin;
	return aujourdhui;
}
