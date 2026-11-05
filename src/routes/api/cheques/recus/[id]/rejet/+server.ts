import { schemaRejet } from '#lib/schemas/cheques.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaRejet, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.cheques.rejeter(app.ctx(locals.acces), { id: Number(params.id), date: entree.valeur.date })
	);
}
