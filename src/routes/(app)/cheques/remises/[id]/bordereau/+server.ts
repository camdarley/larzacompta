import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

/** Le droit se contrôle dans l'application. Le bordereau se télécharge, ou s'ouvre pour l'imprimer. */
export async function GET({ locals, params, url }) {
	const app = application();
	const modele = exiger(app.cheques.bordereau(app.ctx(locals.acces), Number(params.id)));
	return reponseFichier(await app.socle.exporteurs.pdf(modele), {
		mime: MIME.pdf,
		nom: `${modele.nomFichier}.pdf`,
		type: url.searchParams.has('apercu') ? 'inline' : 'attachment'
	});
}
