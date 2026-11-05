/** Ce que le relevé dit des chèques et de SumUp (AD-11, FR-23, FR-24). */
import { numeroValable } from '../cheques/index.ts';
import type { DateCivile } from '../dates.ts';
import type { GrandJournal, LigneReleveJ } from '../journal.ts';
import { numeroChequeLu } from './references.ts';

type JournalAbsents = Pick<
	GrandJournal,
	'operations' | 'chequesEmis' | 'lignesReleve' | 'pointages'
>;

/** Seule une sortie est un chèque payé : « REMISE CHEQUES 123 » est une entrée. */
export function chequeAbsent(
	j: Pick<GrandJournal, 'operations' | 'chequesEmis'>,
	l: Pick<LigneReleveJ, 'libelle' | 'montant'>
): string | null {
	if (l.montant >= 0) return null;
	const numero = numeroChequeLu(l.libelle);
	return numero !== null && !numeroValable(j, numero) ? numero : null;
}

export type ChequeAbsent = Pick<LigneReleveJ, 'id' | 'compteId' | 'libelle' | 'montant'> & {
	date: DateCivile;
	numero: string;
};

/** Une ligne pointée a déjà été regardée : elle ne se signale plus. */
export function chequesAbsents(j: JournalAbsents, fin?: DateCivile): ChequeAbsent[] {
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	return j.lignesReleve.flatMap((l) => {
		if (pointees.has(l.id) || (fin !== undefined && l.date > fin)) return [];
		const numero = chequeAbsent(j, l);
		if (numero === null) return [];
		const { id, compteId, libelle, montant, date } = l;
		return [{ id, compteId, libelle, montant, date, numero }];
	});
}

export type ModeleSumup = {
	natureBrutId: number | null;
	actionBrutId: number | null;
	natureFraisId: number | null;
	actionFraisId: number | null;
};

/** Natures et Action du dernier versement SumUp : le prochain se répartit pareil. */
export function sumupPrecedent(j: Pick<GrandJournal, 'operations'>): ModeleSumup {
	const dernier = j.operations.filter((o) => o.modePaiement === 'sumup').at(-1);
	const brut = dernier?.lignes.find((l) => l.montant > 0);
	const frais = dernier?.lignes.find((l) => l.montant < 0);
	return {
		natureBrutId: brut?.natureId ?? null,
		actionBrutId: brut?.actionId ?? null,
		natureFraisId: frais?.natureId ?? null,
		actionFraisId: frais?.actionId ?? null
	};
}
