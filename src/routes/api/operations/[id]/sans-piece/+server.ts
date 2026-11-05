import { schemaSansPiece } from '#lib/schemas/operations.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaSansPiece, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.operations.definirSansPiece(app.ctx(locals.acces), {
			id: Number(params.id),
			sansPiece: entree.valeur.sansPiece
		})
	);
}
