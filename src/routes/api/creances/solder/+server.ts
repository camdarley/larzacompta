import { schemaSolder } from '#lib/schemas/creances.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaSolder, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.creances.solder(app.ctx(locals.acces), entree.valeur));
}
