/** Forme commune à toutes les sources de relevé (AD-9) : aucun format de banque au-delà de ce type. */
import type { DateCivile } from '../dates.ts';
import type { Centimes } from '../montant.ts';

export type LigneNormalisee = {
	date: DateCivile;
	montant: Centimes;
	libelle: string;
	identifiant: string | null;
};

export type SoldeLu = { date: DateCivile; montant: Centimes };

export type ReleveNormalise = {
	lignes: LigneNormalisee[];
	solde: SoldeLu | null;
};
