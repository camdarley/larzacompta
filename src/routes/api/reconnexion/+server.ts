import { schemaConnexion } from '#lib/schemas/acces.ts';
import { application } from '#lib/server/composition.ts';
import { poserCookieSession } from '#lib/server/cookies.ts';
import { lireJson, reponseJson } from '#lib/server/http.ts';
import { succes } from '#lib/domaine/resultat.ts';

/** Session expirée : se reconnecter sans recharger la page, la saisie reste intacte (AD-14). */
export async function POST({ request, locals, cookies }) {
	const entree = await lireJson(schemaConnexion, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	const r = await app.acces.connecter(app.ctx(null), { ...entree.valeur, adresse: locals.adresse });
	if (!r.ok) return reponseJson(r);
	poserCookieSession(cookies, r.valeur.jeton, r.valeur.expireLe);
	return reponseJson(succes(true));
}
