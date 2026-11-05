import { schemaCreation } from '#lib/schemas/operations.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaCreation, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.operations.creer(app.ctx(locals.acces), entree.valeur));
}
