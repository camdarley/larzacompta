import { schemaMotDePasse, schemaPreferences } from '#lib/schemas/acces.ts';
import { valider } from '#lib/schemas/valider.ts';
import { application } from '#lib/server/composition.ts';
import { poserCookieTheme } from '#lib/server/cookies.ts';
import { accesRequis, champsDe, refus } from '#lib/server/http.ts';

export function load({ locals }) {
	return { preferences: accesRequis(locals.acces).preferences };
}

export const actions = {
	preferences: async ({ request, locals, cookies }) => {
		const champs = champsDe(await request.formData());
		const entree = valider(schemaPreferences, {
			theme: champs.theme,
			raccourcis: champs.raccourcis === 'on'
		});
		if (!entree.ok) return refus(entree.erreur);
		const app = application();
		const r = app.acces.changerPreferences(app.ctx(locals.acces), entree.valeur);
		if (!r.ok) return refus(r.erreur);
		poserCookieTheme(cookies, entree.valeur.theme);
		return { reussi: true };
	},
	motDePasse: async ({ request, locals }) => {
		const entree = valider(schemaMotDePasse, champsDe(await request.formData()));
		if (!entree.ok) return refus(entree.erreur);
		const app = application();
		const r = app.acces.changerMotDePasse(app.ctx(locals.acces), entree.valeur);
		return r.ok ? { reussi: true } : refus(r.erreur);
	}
};
