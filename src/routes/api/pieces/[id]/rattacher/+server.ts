import { schemaRattachement } from '#lib/schemas/pieces.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaRattachement, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.pieces.rattacher(app.ctx(locals.acces), { pieceId: Number(params.id), ...entree.valeur })
	);
}
