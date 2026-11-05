import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, params }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const id = Number(params.id);
	const { resteAnnule, detteOuverte, total, date, numero } = exiger(
		app.factures.apercuAvoir(ctx, id)
	);
	return {
		vue: exiger(app.factures.detail(ctx, id)),
		plan: { resteAnnule, detteOuverte, total, date, numero }
	};
}
