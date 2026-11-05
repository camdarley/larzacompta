import { schemaRemise } from '#lib/schemas/cheques.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaRemise, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.cheques.creerRemise(app.ctx(locals.acces), entree.valeur));
}
