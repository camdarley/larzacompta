import { redirect } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals, params }) {
	const app = application();
	const ecran = exiger(app.caisses.ecranCaisse(app.ctx(locals.acces), Number(params.id)));
	// Une caisse déjà ouverte se compte dans sa Session.
	if ('sessionId' in ecran && !('mode' in ecran)) {
		redirect(303, `/sessions/${ecran.sessionId}/comptage`);
	}
	return { ecran };
}
