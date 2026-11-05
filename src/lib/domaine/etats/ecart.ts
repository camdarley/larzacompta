/** Écart et ses causes (SCHEMA-DONNEES §8). Tout se déduit du journal, rien n'est stocké (AD-4). */
import { repereCaisse, sessionOuverteLe, soldeCourantCaisse } from '../caisse/index.ts';
import type { DateCivile } from '../dates.ts';
import type { Constat, CoteJ, GrandJournal, LigneReleveJ, OperationJ } from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import { soldeCompte } from './soldes.ts';

type JournalEcart = Pick<
	GrandJournal,
	| 'ancres'
	| 'operations'
	| 'constats'
	| 'comptages'
	| 'sessions'
	| 'pointages'
	| 'lignesReleve'
	| 'comptes'
>;

export function dernierConstat(
	j: Pick<GrandJournal, 'constats'>,
	compteId: number,
	d: DateCivile
): Constat | undefined {
	return j.constats
		.filter((c) => c.compteId === compteId && c.date <= d)
		.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
		.at(-1);
}

/**
 * Constaté moins calculé. Sans constat ni Comptage, ou pour les chèques à remettre : pas d'Écart.
 * Une caisse lit `soldeCourantCaisse` : un constat s'y compare en fin de journée (DECISIONS.md),
 * un Comptage selon sa Session.
 */
export function ecart(j: JournalEcart, compteId: number, d: DateCivile): Centimes | null {
	const type = j.comptes.find((c) => c.id === compteId)?.type;
	if (type === 'banque' || type === 'epargne') {
		const constat = dernierConstat(j, compteId, d);
		return constat ? centimes(constat.solde - soldeCompte(j, compteId, d)) : null;
	}
	if (type === 'caisse') {
		if (repereCaisse(j, compteId, { jour: d }) === undefined) return null;
		return centimes(soldeCourantCaisse(j, compteId, { jour: d }) - soldeCompte(j, compteId, d));
	}
	return null;
}

/** Datation de tous les éléments d'un Pointage, pour `elementOuvert`. */
function indexPointages(j: Pick<GrandJournal, 'operations' | 'pointages' | 'lignesReleve'>) {
	const dateCote = new Map(j.operations.flatMap((o) => o.cotes.map((c) => [c.id, c.date])));
	const dateLigne = new Map(j.lignesReleve.map((l) => [l.id, l.date]));
	const dernierJour = new Map<number, DateCivile>();
	const parCote = new Map<number, number>();
	const parLigne = new Map<number, number>();
	for (const p of j.pointages) {
		const dates = [
			...p.coteIds.flatMap((id) => dateCote.get(id) ?? []),
			...p.ligneReleveIds.flatMap((id) => dateLigne.get(id) ?? [])
		].sort();
		dernierJour.set(p.id, dates.at(-1) ?? '');
		for (const id of p.coteIds) parCote.set(id, p.id);
		for (const id of p.ligneReleveIds) parLigne.set(id, p.id);
	}
	return { dernierJour, parCote, parLigne };
}

export type ElementPointable = { type: 'cote' | 'ligne'; id: number; date: DateCivile };

/** Daté au plus tard `d`, et pas pointé, ou pointé avec un élément daté après `d`. */
export function elementOuvert(
	j: Pick<GrandJournal, 'operations' | 'pointages' | 'lignesReleve'>,
	x: ElementPointable,
	d: DateCivile
): boolean {
	if (x.date > d) return false;
	const index = indexPointages(j);
	const pointage = (x.type === 'cote' ? index.parCote : index.parLigne).get(x.id);
	if (pointage === undefined) return true;
	return (index.dernierJour.get(pointage) ?? '') > d;
}

export type CoteOuvert = { cote: CoteJ; operation: OperationJ };

export function ouverts(
	j: Pick<GrandJournal, 'operations' | 'pointages' | 'lignesReleve'>,
	compteId: number,
	d: DateCivile
): { lignes: LigneReleveJ[]; cotes: CoteOuvert[] } {
	return {
		lignes: j.lignesReleve.filter(
			(l) =>
				l.compteId === compteId && elementOuvert(j, { type: 'ligne', id: l.id, date: l.date }, d)
		),
		cotes: j.operations.flatMap((operation) =>
			operation.cotes
				.filter(
					(c) =>
						c.compteId === compteId && elementOuvert(j, { type: 'cote', id: c.id, date: c.date }, d)
				)
				.map((cote) => ({ cote, operation }))
		)
	};
}

export function ecartExplique(j: JournalEcart, compteId: number, d: DateCivile): Centimes {
	const type = j.comptes.find((c) => c.id === compteId)?.type;
	// Une Session ouverte attend sa Recette d'espèces. Sinon, un Écart de caisse est une Opération.
	if (type === 'caisse' && sessionOuverteLe(j, compteId, d))
		return ecart(j, compteId, d) ?? centimes(0);
	if (type !== 'banque' && type !== 'epargne') return centimes(0);
	const o = ouverts(j, compteId, d);
	return centimes(
		sommeCentimes(o.lignes.map((l) => l.montant)) -
			sommeCentimes(o.cotes.map((c) => c.cote.montant))
	);
}

export function ecartNonExplique(
	j: JournalEcart,
	compteId: number,
	d: DateCivile
): Centimes | null {
	const brut = ecart(j, compteId, d);
	return brut === null ? null : centimes(brut - ecartExplique(j, compteId, d));
}

export type Causes = {
	ecart: Centimes;
	explique: Centimes;
	nonExplique: Centimes;
	lignes: LigneReleveJ[];
	cotes: CoteOuvert[];
	/** Non pointés, et antérieurs au dernier relevé : ils y auraient dû figurer. */
	anciennes: CoteOuvert[];
};

/** `debutReleve` : première date du dernier relevé importé. */
export function causesEcart(
	j: JournalEcart,
	compteId: number,
	d: DateCivile,
	debutReleve: DateCivile
): Causes | null {
	const brut = ecart(j, compteId, d);
	if (brut === null) return null;
	const o = ouverts(j, compteId, d);
	const explique = ecartExplique(j, compteId, d);
	return {
		ecart: brut,
		explique,
		nonExplique: centimes(brut - explique),
		lignes: o.lignes,
		cotes: o.cotes,
		anciennes: o.cotes.filter((c) => c.cote.date < debutReleve)
	};
}
