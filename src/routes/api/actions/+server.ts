import { schemaCreationVolee } from '#lib/schemas/operations.ts';
import { application } from '#lib/server/composition.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';

/** « Créer l'Action Kermesse » depuis `selecteur-recherche`. */
export async function POST({ request, locals }) {
	const entree = await lireJson(schemaCreationVolee, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	return reponseJson(
		app.parametrage.creerActionVolee(app.ctx(locals.acces), entree.valeur.libelle)
	);
}
