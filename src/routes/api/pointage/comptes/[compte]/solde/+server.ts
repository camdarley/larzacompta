import { schemaSolde } from '#lib/schemas/pointage.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

export async function POST({ request, locals, params }) {
	const entree = await lireJson(schemaSolde, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.pointage.saisirSolde(app.ctx(locals.acces), {
			...entree.valeur,
			compteId: Number(params.compte)
		})
	);
}
