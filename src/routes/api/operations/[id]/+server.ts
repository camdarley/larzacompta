import { schemaModification } from '#lib/schemas/operations.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaModification, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.operations.modifier(app.ctx(locals.acces), { id: Number(params.id), ...entree.valeur })
	);
}

export function GET({ locals, params }) {
	const app = application();
	return reponseJson(app.operations.detail(app.ctx(locals.acces), Number(params.id)));
}
