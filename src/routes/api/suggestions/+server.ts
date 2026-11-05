import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export function GET({ url, locals }) {
	const app = application();
	const intention = url.searchParams.get('intention') === 'recette' ? 'recette' : 'depense';
	return reponseJson(
		app.operations.suggestion(
			app.ctx(locals.acces),
			url.searchParams.get('libelle') ?? '',
			intention
		)
	);
}
