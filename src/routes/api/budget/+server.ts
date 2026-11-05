import { schemaLigneBudget } from '#lib/schemas/budget.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

/** Sortie d'un champ du Budget : seule écriture enregistrée sans bouton (AD-7). */
export async function POST({ request, locals }) {
	const entree = await lireJson(schemaLigneBudget, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(app.budget.enregistrer(app.ctx(locals.acces), entree.valeur));
}
