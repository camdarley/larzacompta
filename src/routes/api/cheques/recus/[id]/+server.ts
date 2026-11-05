import { schemaModificationCheque } from '#lib/schemas/cheques.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaModificationCheque, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.cheques.modifierRecu(app.ctx(locals.acces), { ...entree.valeur, id: Number(params.id) })
	);
}
