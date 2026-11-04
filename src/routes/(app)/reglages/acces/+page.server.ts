import { rolesLivres } from '#lib/fonctions.ts';
import { schemaCreationAcces } from '#lib/schemas/acces.ts';
import { schemaId } from '#lib/schemas/parametrage.ts';
import { valider } from '#lib/schemas/valider.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { champsDe, exiger, refus } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	return {
		liste: exiger(app.acces.lister(app.ctx(locals.acces))),
		roles: rolesLivres(),
		moi: locals.acces?.id ?? 0
	};
}

export const actions = {
	creer: async ({ request, locals, url }) => {
		const champs = champsDe(await request.formData());
		const entree = valider(schemaCreationAcces, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		if (!rolesLivres().includes(entree.valeur.role)) {
			return refus({ code: 'acces_refuse' }, champs);
		}
		const app = application();
		const r = app.acces.creer(app.ctx(locals.acces), entree.valeur);
		if (!r.ok) return refus(r.erreur, champs);
		// Le jeton clair n'existe qu'ici, une seule fois : seul son SHA-256 est en base.
		return { lien: `${url.origin}/invitation/${r.valeur.jeton}`, nom: entree.valeur.nomAffiche };
	},
	revoquer: action(schemaId, (app, ctx, e) => app.acces.revoquer(ctx, e.id))
};
