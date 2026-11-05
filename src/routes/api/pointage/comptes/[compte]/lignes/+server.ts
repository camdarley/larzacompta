import { schemaLigneReleve } from '#lib/schemas/pointage.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaLigneReleve, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.pointage.saisirLigne(app.ctx(locals.acces), {
			...entree.valeur,
			compteId: Number(params.compte)
		})
	);
}
