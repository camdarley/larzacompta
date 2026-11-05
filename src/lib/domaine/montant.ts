/**
 * Seul module qui convertit texte et montant (AD-2).
 * Tout passe par des entiers : aucune conversion de décimal, aucune arithmétique flottante.
 */
import { echec, succes, type Resultat } from './resultat.ts';

declare const marque: unique symbol;

/** Montant en centimes entiers. */
export type Centimes = number & { readonly [marque]: 'Centimes' };

const MOINS = '−';
const INSECABLE = ' ';
const FINE_INSECABLE = ' ';
/** Espaces admises à la saisie, y compris celles que le formateur écrit. */
const ESPACES = /[\s   ]/;

/** Plafond d'une saisie comme d'un relevé : 100 millions d'euros, en centimes. */
export const MONTANT_MAX = 100_000_000_00;

export function centimes(valeur: number): Centimes {
	if (!Number.isSafeInteger(valeur)) {
		// Sans la valeur : ce message finit dans les logs, qui ne portent aucun montant (AD-21).
		throw new Error('Montant non entier ou hors limites.');
	}
	return valeur as Centimes;
}

export function sommeCentimes(valeurs: readonly Centimes[]): Centimes {
	let total = 0;
	for (const v of valeurs) total += v;
	return centimes(total);
}

type Lexeme = { type: 'nombre'; valeur: number } | { type: 'signe'; negatif: boolean };

function chiffre(c: string | undefined): number | null {
	if (c === undefined || c < '0' || c > '9') return null;
	return c.charCodeAt(0) - 48;
}

/** Lit `1 000`, `1000,5` ou `,5` à partir de `debut`. Renvoie les centimes et la position suivante. */
function lireNombre(texte: string, debut: number): { valeur: number; fin: number } | null {
	let i = debut;
	let entier = 0;
	let chiffres = 0;
	const groupes: number[] = [];
	let groupe = 0;

	while (i < texte.length) {
		const c = texte[i];
		const d = chiffre(c);
		if (d !== null) {
			entier = entier * 10 + d;
			chiffres += 1;
			groupe += 1;
			i += 1;
			continue;
		}
		// Une espace ne sépare que des milliers.
		if (c !== undefined && ESPACES.test(c) && chiffre(texte[i + 1]) !== null && chiffres > 0) {
			groupes.push(groupe);
			groupe = 0;
			i += 1;
			continue;
		}
		break;
	}
	if (groupes.length > 0) {
		groupes.push(groupe);
		const [premier = 0, ...suivants] = groupes;
		if (premier > 3 || suivants.some((g) => g !== 3)) return null;
	}

	let decimales = 0;
	const separateur = texte[i];
	if (separateur === ',' || separateur === '.') {
		i += 1;
		let n = 0;
		while (chiffre(texte[i]) !== null) {
			if (n === 2) return null;
			decimales = decimales * 10 + (chiffre(texte[i]) as number);
			n += 1;
			i += 1;
		}
		if (n === 0 && chiffres === 0) return null;
		if (n === 1) decimales *= 10;
	} else if (chiffres === 0) {
		return null;
	}

	const valeur = entier * 100 + decimales;
	return Number.isSafeInteger(valeur) ? { valeur, fin: i } : null;
}

function analyser(texte: string): Lexeme[] | null {
	const lexemes: Lexeme[] = [];
	let i = 0;
	while (i < texte.length) {
		const c = texte[i] as string;
		if (ESPACES.test(c)) {
			i += 1;
		} else if (c === '€') {
			// Le symbole n'est admis qu'après un nombre.
			if (lexemes.at(-1)?.type !== 'nombre') return null;
			i += 1;
		} else if (c === '+' || c === '-' || c === MOINS) {
			lexemes.push({ type: 'signe', negatif: c !== '+' });
			i += 1;
		} else {
			const nombre = lireNombre(texte, i);
			if (nombre === null) return null;
			lexemes.push({ type: 'nombre', valeur: nombre.valeur });
			i = nombre.fin;
		}
	}
	return lexemes;
}

/** Lit un montant ou une addition (`220+180`, `100-20`). */
export function lireMontant(texte: string): Resultat<Centimes> {
	const invalide = echec<Centimes>('montant_invalide');
	const lexemes = analyser(texte);
	if (lexemes === null || lexemes.length === 0) return invalide;

	let total = 0;
	let negatif = false;
	let signePose = false;
	let attendNombre = true;
	for (const lexeme of lexemes) {
		if (lexeme.type === 'signe') {
			if (signePose) return invalide;
			negatif = lexeme.negatif;
			signePose = true;
			attendNombre = true;
		} else {
			if (!attendNombre) return invalide;
			total += negatif ? -lexeme.valeur : lexeme.valeur;
			if (!Number.isSafeInteger(total)) return invalide;
			negatif = false;
			signePose = false;
			attendNombre = false;
		}
	}
	if (attendNombre) return invalide;
	return succes(centimes(total));
}

function grouperMilliers(entier: string, separateur: string): string {
	let resultat = '';
	const longueur = entier.length;
	for (let i = 0; i < longueur; i++) {
		if (i > 0 && (longueur - i) % 3 === 0) resultat += separateur;
		resultat += entier[i];
	}
	return resultat;
}

/** Parties entières sans passer par une division flottante : tout vient du texte de l'entier. */
function decomposer(c: Centimes): { euros: string; cents: string; negatif: boolean } {
	const texte = String(Math.abs(c)).padStart(3, '0');
	return {
		euros: texte.slice(0, -2),
		cents: texte.slice(-2),
		negatif: c < 0
	};
}

/** `1 234,56 €`, `− 1 234,56 €`. */
export function formaterMontant(c: Centimes): string {
	const { euros, cents, negatif } = decomposer(c);
	const corps = `${grouperMilliers(euros, FINE_INSECABLE)},${cents}${INSECABLE}€`;
	return negatif ? `${MOINS}${INSECABLE}${corps}` : corps;
}

/** Pour une liste mêlant recettes et dépenses : `+ 200,00 €`, `− 120,00 €`. */
export function formaterMontantSigne(c: Centimes): string {
	const texte = formaterMontant(c);
	return c > 0 ? `+${INSECABLE}${texte}` : texte;
}

/** Valeur d'un champ, formatée à la sortie : `1 000,50`. */
export function formaterSaisie(c: Centimes): string {
	const { euros, cents, negatif } = decomposer(c);
	return `${negatif ? MOINS : ''}${grouperMilliers(euros, FINE_INSECABLE)},${cents}`;
}

/** Terme court d'une addition : `220`, `220,50`. */
export function formaterTerme(c: Centimes): string {
	const { euros, cents, negatif } = decomposer(c);
	const corps = grouperMilliers(euros, FINE_INSECABLE);
	const texte = cents === '00' ? corps : `${corps},${cents}`;
	return negatif ? `${MOINS}${INSECABLE}${texte}` : texte;
}

/** Format d'export : `1234,56`, sans espace ni symbole, ce qu'Excel français relit comme un nombre. */
export function formaterCsv(c: Centimes): string {
	const { euros, cents, negatif } = decomposer(c);
	return `${negatif ? '-' : ''}${euros},${cents}`;
}

/** Lecture accessible : « moins 1 234 euros 56 ». */
export function lectureMontant(c: Centimes): string {
	const { euros, cents, negatif } = decomposer(c);
	const prefixe = negatif ? 'moins ' : '';
	const entier = grouperMilliers(euros, ' ');
	if (euros === '0' && cents !== '00') {
		const n = cents.replace(/^0/, '');
		return `${prefixe}${n} centime${n === '1' ? '' : 's'}`;
	}
	const unite = euros === '0' || euros === '1' ? 'euro' : 'euros';
	return `${prefixe}${entier} ${unite}${cents === '00' ? '' : ` ${cents}`}`;
}
