import { NOM_PRODUIT } from '#lib/produit.ts';
import { application } from '#lib/server/composition.ts';

/** Porte le nom de l'association. `display: browser` : pas d'application installable en v1. */
export function GET() {
	const nom = application().parametrage.association()?.nom ?? NOM_PRODUIT;
	const corps = {
		name: nom,
		short_name: nom,
		lang: 'fr',
		start_url: '/',
		display: 'browser',
		icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
	};
	return new Response(JSON.stringify(corps), {
		headers: { 'content-type': 'application/manifest+json; charset=utf-8' }
	});
}
