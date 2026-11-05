import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { reponseFichier } from '#lib/server/telechargement.ts';

/**
 * Service d'une Pièce, jamais depuis un chemin public (AD-16).
 * Le droit se contrôle dans l'application : cette route n'a pas de layout.
 */
export function GET({ locals, params, url }) {
	if (!/^[0-9a-f]{64}$/.test(params.sha)) {
		error(404, { code: 'element_introuvable', message: message('element_introuvable') });
	}
	const app = application();
	const piece = exiger(app.pieces.fichier(app.ctx(locals.acces), params.sha));
	const type = url.searchParams.has('telecharger') ? 'attachment' : 'inline';
	return reponseFichier(piece.octets, { mime: piece.mime, nom: piece.nom, type });
}
