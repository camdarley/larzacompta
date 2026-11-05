/** Identité de l'APE, Comptes, Natures, Actions, Groupes (FR-1). */
import { centimes, type Centimes } from './montant.ts';
import { echec, succes, type Resultat } from './resultat.ts';

export type Association = {
	nom: string;
	adresse: string;
	moisDebutExercice: number;
	mentionsFacture: string;
	etapeAssistant: number;
};

export const TYPES_COMPTE = ['banque', 'epargne', 'caisse', 'cheques_a_remettre'] as const;
export type TypeCompte = (typeof TYPES_COMPTE)[number];

export const LIBELLES_TYPE_COMPTE: Record<TypeCompte, string> = {
	banque: 'Banque',
	epargne: 'Épargne',
	caisse: 'Caisse',
	cheques_a_remettre: 'Chèques à remettre'
};

export type Compte = {
	id: number;
	libelle: string;
	type: TypeCompte;
	reserve: boolean;
	ordre: number;
	actif: boolean;
};

/** Rangé après tous les autres. Il naît seul, et l'epic 8 le fera vivre. */
export const COMPTE_CHEQUES = {
	libelle: 'Chèques à remettre',
	type: 'cheques_a_remettre',
	ordre: 1_000_000
} as const;

/** Comptes que l'APE tient elle-même : ceux qu'on crée, range et choisit à la saisie. */
export const comptesTenus = <C extends Pick<Compte, 'type'>>(comptes: readonly C[]) =>
	comptes.filter((c) => c.type !== COMPTE_CHEQUES.type);

export type Groupe = { id: number; libelle: string; ordre: number };

export const CODES_SYSTEME = [
	'ecart_caisse',
	'ajustement',
	'recette_especes',
	'somme_a_rendre'
] as const;
export type CodeSysteme = (typeof CODES_SYSTEME)[number];

export type Nature = {
	id: number;
	libelle: string;
	groupeId: number;
	neutre: boolean;
	codeSysteme: CodeSysteme | null;
	actif: boolean;
};

export type Action = {
	id: number;
	libelle: string;
	groupeId: number;
	avecCaisse: boolean;
	actif: boolean;
};

export type Ancre = { compteId: number; exerciceId: number; solde: Centimes };

function memeLibelle(a: string, b: string) {
	return a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
}

/** Unicité à la casse près, en plus de `COLLATE NOCASE`, qui ignore les accents majuscules. */
export function libelleDisponible(
	libelle: string,
	existants: readonly { id: number; libelle: string }[],
	sauf?: number
): Resultat<string> {
	const pris = existants.some((e) => e.id !== sauf && memeLibelle(e.libelle, libelle));
	return pris ? echec('libelle_deja_utilise', { champ: 'libelle' }) : succes(libelle);
}

type Ordonnable = { id: number; ordre: number };

/** Échange un élément avec son voisin. Renvoie les ordres à écrire, sans doublon d'ordre. */
export function deplacer<T extends Ordonnable>(
	liste: readonly T[],
	id: number,
	sens: 'monter' | 'descendre'
): { id: number; ordre: number }[] {
	const triee = [...liste].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
	const i = triee.findIndex((e) => e.id === id);
	const j = sens === 'monter' ? i - 1 : i + 1;
	const a = triee[i];
	const b = triee[j];
	if (a === undefined || b === undefined) return [];
	triee[i] = b;
	triee[j] = a;
	return triee.map((e, ordre) => ({ id: e.id, ordre: ordre + 1 }));
}

export function prochainOrdre(liste: readonly { ordre: number }[]): number {
	return liste.reduce((max, e) => Math.max(max, e.ordre), 0) + 1;
}

export function soldeAncre(solde: Centimes | null | undefined): Centimes {
	return solde ?? centimes(0);
}
