import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import { lireApercu } from '#lib/server/apercus.ts';
import { accesRequis } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

export function GET({ locals }) {
	const apercu = lireApercu(accesRequis(locals.acces).id);
	if (apercu === null) {
		error(404, { code: 'element_introuvable', message: message('element_introuvable') });
	}
	return reponseFichier(apercu.octets, { mime: MIME.pdf, nom: apercu.nom, type: 'inline' });
}
