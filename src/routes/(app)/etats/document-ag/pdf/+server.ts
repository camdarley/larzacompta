import { message } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';
import { error } from '@sveltejs/kit';

/** Aperçu en iframe, ou téléchargement. Le droit se contrôle dans l'application. */
export async function GET({ locals, url }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const exercice = exiger(app.exercices.selection(ctx, url.searchParams.get('exercice')));
	if (exercice === null) {
		error(404, { code: 'element_introuvable', message: message('element_introuvable') });
	}
	const modele = exiger(app.etats.modele(ctx, 'document-ag', exercice));
	return reponseFichier(await app.socle.exporteurs.pdf(modele), {
		mime: MIME.pdf,
		nom: `${modele.nomFichier}.pdf`,
		type: url.searchParams.has('telecharger') ? 'attachment' : 'inline'
	});
}
