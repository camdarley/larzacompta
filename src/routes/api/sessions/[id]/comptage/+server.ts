import { schemaComptageSession } from '#lib/schemas/caisses.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaComptageSession, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.caisses.compterSession(app.ctx(locals.acces), {
			sessionId: Number(params.id),
			...entree.valeur
		})
	);
}
