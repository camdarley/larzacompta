import { schemaFacture } from '#lib/schemas/factures.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

/** Le numéro que le `dialogue` annonce, ou le refus, avant toute confirmation. */
export function GET({ locals, params }) {
	const app = application();
	return reponseJson(app.factures.controlerValidation(app.ctx(locals.acces), Number(params.id)));
}

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaFacture, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.factures.modifier(app.ctx(locals.acces), Number(params.id), entree.valeur)
	);
}
