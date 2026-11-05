import { schemaPointage } from '#lib/schemas/pointage.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

/** Une seule route crée un Pointage, et seulement sur une action explicite (AD-8). */
export async function POST({ request, locals }) {
	const entree = await lireJson(schemaPointage, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.pointage.pointer(app.ctx(locals.acces), entree.valeur));
}
