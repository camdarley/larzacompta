/** Règles des Accès et des sessions (AD-14). */
import type { Instant } from './dates.ts';
import type { Role } from './droits.ts';
import { echec, succes, type Resultat } from './resultat.ts';

export const THEMES = ['systeme', 'clair', 'sombre'] as const;
export type Theme = (typeof THEMES)[number];

export type Preferences = { theme: Theme; raccourcis: boolean };

export const PREFERENCES_PAR_DEFAUT: Preferences = { theme: 'systeme', raccourcis: true };

export type AccesConnecte = {
	id: number;
	identifiant: string;
	nomAffiche: string;
	role: Role;
	preferences: Preferences;
};

export const LONGUEUR_MIN_MOT_DE_PASSE = 12;
export const DUREE_LIEN_JOURS = 7;

const MINUTE = 60_000;
const JOUR = 24 * 60 * MINUTE;
export const INACTIVITE_MAX = 7 * JOUR;
export const DUREE_MAX_SESSION = 30 * JOUR;
const FENETRE_TENTATIVES = 15 * MINUTE;
export const ECHECS_MAX = 10;
/** La dernière activité ne s'écrit pas à chaque requête. */
const PAS_ACTIVITE = MINUTE;

function versMs(instant: Instant) {
	return new Date(instant).getTime();
}

function versInstant(ms: number): Instant {
	return new Date(ms).toISOString();
}

export function lirePreferences(json: string): Preferences {
	let brut: unknown;
	try {
		brut = JSON.parse(json);
	} catch {
		brut = {};
	}
	const p = (typeof brut === 'object' && brut !== null ? brut : {}) as Partial<Preferences>;
	return {
		theme: THEMES.includes(p.theme as Theme) ? (p.theme as Theme) : 'systeme',
		raccourcis: p.raccourcis !== false
	};
}

export function verifierMotDePasse(motDePasse: string): Resultat<string> {
	return [...motDePasse].length >= LONGUEUR_MIN_MOT_DE_PASSE
		? succes(motDePasse)
		: echec('mot_de_passe_court', { champ: 'motDePasse' });
}

export function expirationLien(maintenant: Instant): Instant {
	return versInstant(versMs(maintenant) + DUREE_LIEN_JOURS * JOUR);
}

/** 7 jours après la dernière activité, au plus tard 30 jours après la création. */
export function expirationSession(creeLe: Instant, activite: Instant): Instant {
	return versInstant(
		Math.min(versMs(activite) + INACTIVITE_MAX, versMs(creeLe) + DUREE_MAX_SESSION)
	);
}

export function sessionExpiree(expireLe: Instant, maintenant: Instant): boolean {
	return versMs(expireLe) <= versMs(maintenant);
}

export function activiteAEcrire(derniere: Instant, maintenant: Instant): boolean {
	return versMs(maintenant) - versMs(derniere) >= PAS_ACTIVITE;
}

export type Tentative = { cle: string; echecs: number; premiereLe: Instant };

/** Faux si la clé a atteint 10 échecs dans la fenêtre de 15 minutes. */
export function tentativeAutorisee(t: Tentative | null, maintenant: Instant): boolean {
	if (t === null || t.echecs < ECHECS_MAX) return true;
	return versMs(maintenant) - versMs(t.premiereLe) >= FENETRE_TENTATIVES;
}

/**
 * Compte un échec. Une fenêtre écoulée repart de zéro.
 * Le dixième échec relance la fenêtre : l'attente dure bien 15 minutes.
 */
export function apresEchec(t: Tentative | null, cle: string, maintenant: Instant): Tentative {
	if (t === null || versMs(maintenant) - versMs(t.premiereLe) >= FENETRE_TENTATIVES) {
		return { cle, echecs: 1, premiereLe: maintenant };
	}
	const echecs = t.echecs + 1;
	return { cle, echecs, premiereLe: echecs >= ECHECS_MAX ? maintenant : t.premiereLe };
}

/** A1 : il reste toujours au moins un Accès trésorier·e actif. */
export function revocationPermise(
	cible: { id: number; role: Role },
	tresoriersActifs: readonly { id: number }[]
): Resultat<true> {
	if (cible.role === 'tresorier' && tresoriersActifs.every((t) => t.id === cible.id)) {
		return echec('dernier_tresorier');
	}
	return succes(true);
}
