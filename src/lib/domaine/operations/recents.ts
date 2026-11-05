/** Comptes, Natures et Actions récents : les premiers de `selecteur-recherche`. */
import type { GrandJournal } from '../journal.ts';

export type Recents = { comptes: number[]; natures: number[]; actions: number[] };

const LIMITE = 5;

function ajouter(liste: number[], id: number | null) {
	if (id !== null && liste.length < LIMITE && !liste.includes(id)) liste.push(id);
}

export function recents(j: Pick<GrandJournal, 'operations'>): Recents {
	const r: Recents = { comptes: [], natures: [], actions: [] };
	const operations = [...j.operations].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
	for (const op of operations) {
		for (const c of op.cotes) ajouter(r.comptes, c.compteId);
		for (const l of op.lignes) {
			ajouter(r.natures, l.natureId);
			ajouter(r.actions, l.actionId);
		}
	}
	return r;
}
