import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	return exiger(app.exploitation.aPropos(app.ctx(locals.acces)));
}
