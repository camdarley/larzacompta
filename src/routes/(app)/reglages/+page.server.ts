import { schemaAssociation } from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	return { association: exiger(app.parametrage.fiche(app.ctx(locals.acces))) };
}

export const actions = {
	default: action(schemaAssociation, (app, ctx, e) =>
		app.parametrage.enregistrerAssociation(ctx, e)
	)
};
