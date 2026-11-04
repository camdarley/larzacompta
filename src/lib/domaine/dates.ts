/**
 * Dates comptables : chaînes `YYYY-MM-DD`, jour civil Europe/Paris (AD-2).
 * Un instant est une chaîne ISO UTC. Seul ce module convertit l'un en l'autre.
 */
import { echec, succes, type Resultat } from './resultat.ts';

export type DateCivile = string;
export type Instant = string;

const FUSEAU = 'Europe/Paris';
const MOIS = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

function deuxChiffres(n: number) {
	return String(n).padStart(2, '0');
}

function parties(date: DateCivile) {
	const [annee = 0, mois = 0, jour = 0] = date.split('-').map(Number);
	return { annee, mois, jour };
}

function composer(annee: number, mois: number, jour: number): DateCivile {
	return `${String(annee).padStart(4, '0')}-${deuxChiffres(mois)}-${deuxChiffres(jour)}`;
}

function bissextile(annee: number) {
	return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function joursDuMois(annee: number, mois: number) {
	if (mois === 2) return bissextile(annee) ? 29 : 28;
	return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

export function dateValide(date: string): date is DateCivile {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const { annee, mois, jour } = parties(date);
	return mois >= 1 && mois <= 12 && jour >= 1 && jour <= joursDuMois(annee, mois);
}

export function instantVersDate(instant: Instant): DateCivile {
	const champs = new Intl.DateTimeFormat('en-CA', {
		timeZone: FUSEAU,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(instant));
	const lire = (type: string) => champs.find((c) => c.type === type)?.value ?? '';
	return `${lire('year')}-${lire('month')}-${lire('day')}`;
}

/** `12 mars 2026`. */
export function formaterDateLongue(date: DateCivile): string {
	const { annee, mois, jour } = parties(date);
	return `${jour === 1 ? '1er' : jour} ${MOIS[mois - 1]} ${annee}`;
}

/** `12/03/2026`. */
export function formaterDateCourte(date: DateCivile): string {
	const { annee, mois, jour } = parties(date);
	return `${deuxChiffres(jour)}/${deuxChiffres(mois)}/${annee}`;
}

export function nomDuMois(mois: number): string {
	return MOIS[mois - 1] ?? '';
}

/** Pour une liste de choix : « Septembre ». */
export function capitaliser(texte: string): string {
	return texte.charAt(0).toLocaleUpperCase('fr') + texte.slice(1);
}

/** `12/03/2026 à 18:05`, heure de Paris. */
export function formaterHorodatage(instant: Instant): string {
	const heure = new Intl.DateTimeFormat('fr-FR', {
		timeZone: FUSEAU,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(new Date(instant));
	return `${formaterDateCourte(instantVersDate(instant))} à ${heure}`;
}

/** Lit `12/03/2026` ou `2026-03-12`. */
export function lireDate(texte: string): Resultat<DateCivile> {
	const net = texte.trim();
	if (dateValide(net)) return succes(net);
	const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(net);
	if (m) {
		const date = composer(Number(m[3]), Number(m[2]), Number(m[1]));
		if (dateValide(date)) return succes(date);
	}
	return echec('date_invalide');
}

export function ajouterJours(date: DateCivile, jours: number): DateCivile {
	let { annee, mois, jour } = parties(date);
	let reste = jours;
	while (reste > 0) {
		const disponibles = joursDuMois(annee, mois) - jour;
		if (reste <= disponibles) {
			jour += reste;
			reste = 0;
		} else {
			reste -= disponibles + 1;
			jour = 1;
			mois += 1;
			if (mois > 12) {
				mois = 1;
				annee += 1;
			}
		}
	}
	while (reste < 0) {
		if (-reste < jour) {
			jour += reste;
			reste = 0;
		} else {
			reste += jour;
			mois -= 1;
			if (mois < 1) {
				mois = 12;
				annee -= 1;
			}
			jour = joursDuMois(annee, mois);
		}
	}
	return composer(annee, mois, jour);
}
