import { schemaApercuFacture } from '#lib/schemas/factures.ts';
import { poserApercu } from '#lib/server/apercus.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, lireJson, reponseJson } from '#lib/server/http.ts';

/** Rien ne s'enregistre : le PDF attend en mémoire que l'iframe vienne le chercher. */
export async function POST({ request, locals }) {
	const entree = await lireJson(schemaApercuFacture, request);
	if (!entree.ok) return reponseJson(entree);
	const app = application();
	const acces = accesRequis(locals.acces);
	const modele = app.factures.apercu(app.ctx(acces), entree.valeur);
	if (!modele.ok) return reponseJson(modele);
	const octets = await app.socle.exporteurs.pdf(modele.valeur);
	poserApercu(acces.id, octets, `${modele.valeur.nomFichier}.pdf`);
	return reponseJson({ ok: true, valeur: { octets: octets.length } });
}
