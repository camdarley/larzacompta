import { schemaFormule } from '#lib/schemas/cheques.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaFormule, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.cheques.annulerFormule(app.ctx(locals.acces), entree.valeur));
}
