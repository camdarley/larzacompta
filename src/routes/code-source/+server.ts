import { error } from '@sveltejs/kit';
import { VERSION } from '#lib/produit.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { reponseFichier } from '#lib/server/telechargement.ts';

/** Le code exact de ce build, pour toute personne connectée (AGPL-3.0 §13). */
export function GET({ locals }) {
	const app = application();
	const octets = exiger(app.exploitation.codeSource(app.ctx(locals.acces)));
	if (octets === null) error(404, { code: 'page_introuvable', message: 'Archive absente.' });
	return reponseFichier(octets, {
		mime: 'application/gzip',
		nom: `ape-compta-${VERSION}.tar.gz`,
		type: 'attachment'
	});
}
