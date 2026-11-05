import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return { vue: exiger(app.cheques.emis(ctx)) };
}
