import { schemaId } from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, params }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return {
		session: exiger(app.caisses.session(ctx, Number(params.id))),
		banque: exiger(app.caisses.compteDeDepot(ctx))
	};
}

export const actions = {
	cloturer: action(schemaId, (app, ctx, e) => app.caisses.cloturer(ctx, e.id)),
	rouvrir: action(schemaId, (app, ctx, e) => app.caisses.rouvrir(ctx, e.id))
};
