import { peut } from '#lib/domaine/droits.ts';
import { schemaCreance } from '#lib/schemas/creances.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const acces = accesRequis(locals.acces);
	const ctx = app.ctx(acces);
	return {
		suivi: exiger(app.creances.suivi(ctx, exercice)),
		// Saisir exige le droit : un·e lecteur·rice n'a pas besoin de cette liste.
		actions: peut(acces.role, 'saisir')
			? exiger(app.operations.contexteSaisie(ctx)).actions.filter((a) => a.actif)
			: [],
		aujourdhui: ctx.aujourdhui
	};
}

export const actions = {
	ajouter: action(schemaCreance, (app, ctx, e) => app.creances.ajouter(ctx, e))
};
