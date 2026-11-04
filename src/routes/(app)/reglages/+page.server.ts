import { schemaAssociation } from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';

export function load() {
	return { association: application().parametrage.association() };
}

export const actions = {
	default: action(schemaAssociation, (app, ctx, e) =>
		app.parametrage.enregistrerAssociation(ctx, e)
	)
};
