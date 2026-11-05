import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export function POST({ locals, params }) {
	const app = application();
	return reponseJson(app.operations.delier(app.ctx(locals.acces), Number(params.id)));
}
