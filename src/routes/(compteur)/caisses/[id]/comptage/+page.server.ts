import { redirect } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals, params, url }) {
	const app = application();
	const inventaire = url.searchParams.get('inventaire') === '1';
	const ecran = exiger(
		app.caisses.ecranCaisse(app.ctx(locals.acces), Number(params.id), inventaire)
	);
	// Une caisse déjà ouverte se compte dans sa Session.
	if ('sessionId' in ecran && !('mode' in ecran)) {
		redirect(303, `/sessions/${ecran.sessionId}/comptage`);
	}
	return { ecran };
}
