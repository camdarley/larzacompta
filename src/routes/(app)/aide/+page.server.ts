import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	return { codeSource: exiger(app.exploitation.codeSourcePresent(app.ctx(locals.acces))) };
}
