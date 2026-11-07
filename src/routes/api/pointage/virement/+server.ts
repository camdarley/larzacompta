import { schemaVirement } from '#lib/schemas/pointage.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaVirement, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.pointage.virement(app.ctx(locals.acces), entree.valeur));
}
