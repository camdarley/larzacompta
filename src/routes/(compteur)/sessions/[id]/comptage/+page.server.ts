import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals, params, url }) {
	const app = application();
	const corriger = url.searchParams.get('corriger') === 'ouverture';
	const ecran = exiger(
		app.caisses.ecranSession(app.ctx(locals.acces), Number(params.id), corriger)
	);
	return { ecran };
}
