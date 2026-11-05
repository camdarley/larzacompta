import { dateProposee } from '#lib/domaine/operations/lecture.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, params, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return {
		vue: exiger(app.factures.detail(ctx, Number(params.id))),
		actions: exiger(app.operations.contexteSaisie(ctx)).actions.filter((a) => a.actif),
		tiers: exiger(app.factures.tiers(ctx)),
		mentions: app.parametrage.association()?.mentionsFacture !== '',
		dateParDefaut: dateProposee(ctx.aujourdhui, exercice)
	};
}
