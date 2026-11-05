import { schemaFacture } from '#lib/schemas/factures.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals }) {
	const entree = await lireJson(schemaFacture, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.factures.creer(app.ctx(locals.acces), entree.valeur));
}
