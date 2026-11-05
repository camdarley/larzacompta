import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export function GET({ url, locals }) {
	const app = application();
	return reponseJson(
		app.operations.palette(app.ctx(locals.acces), url.searchParams.get('q') ?? '')
	);
}
