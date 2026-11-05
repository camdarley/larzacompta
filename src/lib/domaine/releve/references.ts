/** Lecture d'une référence dans un libellé de relevé : n° de facture ou de chèque. */
import { normaliserLibelle } from './empreinte.ts';

const compact = (texte: string) => normaliserLibelle(texte).replace(/[^A-Z0-9]/g, '');
const sansZeros = (mot: string) => mot.replace(/^0+/, '');
const mots = (texte: string) =>
	normaliserLibelle(texte)
		.split(/[^A-Z0-9]+/)
		.filter(Boolean);

const LONGUEUR_MIN = 3;

/** Un nombre seul doit être un mot entier : 14 ne se lit pas dans 2014. */
export function referenceLue(libelle: string, reference: string): boolean {
	const cherchee = compact(reference);
	if (cherchee.length < LONGUEUR_MIN) return false;
	if (/^\d+$/.test(cherchee)) {
		return mots(libelle).some((m) => sansZeros(m) === sansZeros(cherchee));
	}
	return compact(libelle).includes(cherchee);
}

/** Dans un libellé d'Opération, un mot qui mêle chiffres et lettres sert de référence. */
export function referencesDuLibelle(libelle: string): string[] {
	return libelle.split(/\s+/).filter((m) => m.length >= 5 && /\d/.test(m) && /\p{L}/u.test(m));
}

/** Mots de relevé qui ne distinguent rien : ils ne disent pas de quel mouvement il s'agit. */
const SANS_VALEUR = new Set(
	`VIREMENT VIR SEPA PRLV PRELEVEMENT CARTE CHEQUE CHEQUES REMISE FACTURE FRAIS RECU
	EMIS POUR AVEC DANS SANS DEPUIS VERS MOIS`.split(/\s+/)
);

export function motsParlants(texte: string): string[] {
	return mots(texte).filter((m) => m.length >= 4 && !/\d/.test(m) && !SANS_VALEUR.has(m));
}
