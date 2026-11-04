import { redirect } from '@sveltejs/kit';
import { valider } from '#lib/schemas/valider.ts';
import { schemaConnexion } from '#lib/schemas/acces.ts';
import { application } from '#lib/server/composition.ts';
import { poserCookieSession, poserCookieTheme } from '#lib/server/cookies.ts';
import { champsDe, refus, suiteSure } from '#lib/server/http.ts';

export function load({ locals, url }) {
	if (locals.acces) redirect(303, suiteSure(url.searchParams.get('suite')));
	return { oublie: url.searchParams.has('oublie') };
}

export const actions = {
	default: async ({ request, cookies, locals, url }) => {
		const champs = champsDe(await request.formData());
		const saisie = { identifiant: champs.identifiant };

		const entree = valider(schemaConnexion, champs);
		if (!entree.ok) return refus(entree.erreur, saisie);

		const app = application();
		const r = app.acces.connecter(app.ctx(null), { ...entree.valeur, adresse: locals.adresse });
		if (!r.ok) return refus(r.erreur, saisie);

		poserCookieSession(cookies, r.valeur.jeton, r.valeur.expireLe);
		poserCookieTheme(cookies, r.valeur.acces.preferences.theme);
		redirect(303, suiteSure(url.searchParams.get('suite')));
	}
};
