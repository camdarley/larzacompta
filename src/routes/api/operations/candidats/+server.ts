import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export function GET({ url, locals }) {
	const q = url.searchParams;
	const sens = q.get('sens');
	const app = application();
	return reponseJson(
		app.operations.candidats(
			app.ctx(locals.acces),
			q.get('q') ?? '',
			sens === 'depense' || sens === 'recette' ? sens : null,
			Number(q.get('sauf')) || null
		)
	);
}
