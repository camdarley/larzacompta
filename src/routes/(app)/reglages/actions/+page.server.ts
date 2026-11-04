import {
	schemaAction,
	schemaActionExistante,
	schemaActivation,
	schemaId
} from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	return {
		liste: exiger(app.parametrage.actions(ctx)),
		groupes: exiger(app.parametrage.groupes(ctx))
	};
}

export const actions = {
	creer: action(schemaAction, (app, ctx, e) => app.parametrage.creerAction(ctx, e)),
	modifier: action(schemaActionExistante, (app, ctx, e) => app.parametrage.modifierAction(ctx, e)),
	activer: action(schemaActivation, (app, ctx, e) =>
		app.parametrage.activerAction(ctx, e.id, e.actif)
	),
	supprimer: action(schemaId, (app, ctx, e) => app.parametrage.supprimerAction(ctx, e.id))
};
