import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

/** `filename*` : un nom accentué passe, et rien ne sort de la valeur de l'en-tête. */
function disposition(type: 'inline' | 'attachment', nom: string) {
	const ascii = nom.replace(/[^\w.-]/g, '_');
	return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}

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
	return new Response(piece.octets as Uint8Array<ArrayBuffer>, {
		headers: {
			'Content-Type': piece.mime,
			'Content-Length': String(piece.octets.length),
			'Content-Disposition': disposition(type, piece.nom),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store',
			'Content-Security-Policy': "frame-ancestors 'self'"
		}
	});
}
