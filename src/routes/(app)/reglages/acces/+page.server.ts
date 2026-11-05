import { rolesLivres } from '#lib/fonctions.ts';
import { schemaCreationAcces } from '#lib/schemas/acces.ts';
import { schemaId } from '#lib/schemas/parametrage.ts';
import { valider } from '#lib/schemas/valider.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { champsDe, exiger, refus } from '#lib/server/http.ts';

/** Des cases de même nom : `champsDe` n'en garderait qu'une. */
const caissesCochees = (f: FormData) => f.getAll('caisses').map(Number).filter(Number.isInteger);

export function load({ locals }) {
	const app = application();
	return {
		liste: exiger(app.acces.lister(app.ctx(locals.acces))),
		roles: rolesLivres(),
		caisses: exiger(app.parametrage.comptes(app.ctx(locals.acces)))
			.filter((c) => c.type === 'caisse' && c.actif)
			.map((c) => ({ id: c.id, libelle: c.libelle })),
		moi: locals.acces?.id ?? 0
	};
}

export const actions = {
	creer: async ({ request, locals, url }) => {
		const formulaire = await request.formData();
		const champs = champsDe(formulaire);
		const entree = valider(schemaCreationAcces, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		if (!rolesLivres().includes(entree.valeur.role)) {
			return refus({ code: 'acces_refuse' }, champs);
		}
		const app = application();
		const r = app.acces.creer(app.ctx(locals.acces), {
			...entree.valeur,
			caisses: caissesCochees(formulaire)
		});
		if (!r.ok) return refus(r.erreur, champs);
		// Le jeton clair n'existe qu'ici, une seule fois : seul son SHA-256 est en base.
		return { lien: `${url.origin}/invitation/${r.valeur.jeton}`, nom: entree.valeur.nomAffiche };
	},
	caisses: async ({ request, locals }) => {
		const formulaire = await request.formData();
		const champs = champsDe(formulaire);
		const entree = valider(schemaId, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		const app = application();
		const r = app.acces.definirCaisses(app.ctx(locals.acces), {
			id: entree.valeur.id,
			caisses: caissesCochees(formulaire)
		});
		return r.ok ? { reussi: true as const } : refus(r.erreur, champs);
	},
	revoquer: action(schemaId, (app, ctx, e) => app.acces.revoquer(ctx, e.id))
};
