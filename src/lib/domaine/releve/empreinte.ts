/** Empreinte d'une Ligne de relevé : ce qui permet de reconnaître un mouvement sans identifiant. */
import type { DateCivile } from '../dates.ts';
import type { Centimes } from '../montant.ts';

/** Majuscules, sans accent, espaces réduites : un même mouvement se reconnaît d'un export à l'autre. */
export function normaliserLibelle(libelle: string): string {
	return libelle
		.normalize('NFD')
		.replace(/\p{Mn}/gu, '')
		.toLocaleUpperCase('fr')
		.replace(/\s+/g, ' ')
		.trim();
}

export function empreinteLigne(l: {
	date: DateCivile;
	montant: Centimes;
	libelle: string;
}): string {
	return `${l.date}|${l.montant}|${normaliserLibelle(l.libelle)}`;
}
