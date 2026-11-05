import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

/** Le droit se contrôle dans l'application. Sans numéro : il ne s'attribue qu'à la confirmation. */
export async function GET({ locals, params }) {
	const app = application();
	const { modele } = exiger(app.factures.apercuAvoir(app.ctx(locals.acces), Number(params.id)));
	return reponseFichier(await app.socle.exporteurs.pdf(modele), {
		mime: MIME.pdf,
		nom: `${modele.nomFichier}.pdf`,
		type: 'inline'
	});
}
