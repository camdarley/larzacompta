import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, params }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return { remise: exiger(app.cheques.remise(ctx, Number(params.id))) };
}
