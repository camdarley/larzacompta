import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return {
		factures: exiger(app.factures.liste(ctx, exercice)),
		existe: exiger(app.factures.existe(ctx))
	};
}
