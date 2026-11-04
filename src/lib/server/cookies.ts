import type { Cookies } from '@sveltejs/kit';
import type { Instant } from '#lib/domaine/dates.ts';
import type { Theme } from '#lib/domaine/acces.ts';

export const COOKIE_SESSION = 'ape_session';
export const COOKIE_THEME = 'ape_theme';

/** `secure` reste vrai : Kit l'assouplit lui-même pour http://localhost. */
export function poserCookieSession(cookies: Cookies, jeton: string, expireLe: Instant) {
	cookies.set(COOKIE_SESSION, jeton, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: new Date(expireLe)
	});
}

export function retirerCookieSession(cookies: Cookies) {
	cookies.delete(COOKIE_SESSION, { path: '/' });
}

/** Lisible par le rendu serveur pour éviter le flash (AD-20). */
export function poserCookieTheme(cookies: Cookies, theme: Theme) {
	cookies.set(COOKIE_THEME, theme, {
		path: '/',
		httpOnly: false,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
}
