import { redirect } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { COOKIE_SESSION, retirerCookieSession } from '#lib/server/cookies.ts';

export function POST({ cookies }) {
	const jeton = cookies.get(COOKIE_SESSION);
	if (jeton) {
		const app = application();
		app.acces.deconnecter(app.ctx(null), jeton);
	}
	retirerCookieSession(cookies);
	redirect(303, '/connexion');
}
