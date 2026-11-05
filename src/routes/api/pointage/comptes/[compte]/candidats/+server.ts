import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export function GET({ url, locals, params }) {
	const app = application();
	return reponseJson(
		app.pointage.candidats(
			app.ctx(locals.acces),
			Number(params.compte),
			url.searchParams.get('q') ?? ''
		)
	);
}
