import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return { recentes: exiger(app.pieces.depensesRecentes(ctx)) };
}
