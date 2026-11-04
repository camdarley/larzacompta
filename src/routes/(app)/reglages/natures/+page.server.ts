import {
	schemaActivation,
	schemaId,
	schemaNature,
	schemaNatureExistante
} from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	return {
		natures: exiger(app.parametrage.natures(ctx)),
		groupes: exiger(app.parametrage.groupes(ctx))
	};
}

export const actions = {
	creer: action(schemaNature, (app, ctx, e) => app.parametrage.creerNature(ctx, e)),
	modifier: action(schemaNatureExistante, (app, ctx, e) => app.parametrage.modifierNature(ctx, e)),
	activer: action(schemaActivation, (app, ctx, e) =>
		app.parametrage.activerNature(ctx, e.id, e.actif)
	),
	supprimer: action(schemaId, (app, ctx, e) => app.parametrage.supprimerNature(ctx, e.id))
};
