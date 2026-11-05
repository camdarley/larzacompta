import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

/** Archive lisible sans l'outil (FR-35, AD-18). */
export function GET({ locals }) {
	const app = application();
	const { nom, octets } = exiger(app.etats.exportComplet(app.ctx(locals.acces)));
	return reponseFichier(octets, { mime: MIME.zip, nom, type: 'attachment' });
}
