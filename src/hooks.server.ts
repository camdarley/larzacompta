import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { THEMES, type Theme } from '#lib/domaine/acces.ts';
import { deciderRoute } from '#lib/domaine/droits.ts';
import { message } from '#lib/messages.ts';
import { ROUTES } from '#lib/routes.ts';
import { application, demarrerTachesDeFond } from '#lib/server/composition.ts';
import { COOKIE_SESSION, COOKIE_THEME, poserCookieSession } from '#lib/server/cookies.ts';

/** Au démarrage : migrations, puis lien initial si l'instance n'a aucun Accès (AD-14). */
export const init: ServerInit = () => {
	const app = application();
	demarrerTachesDeFond();
	if (!app.acces.instanceSansAcces()) return;
	const r = app.acces.emettreLienInitial(app.ctx(null));
	if (r.ok && r.valeur) {
		const origine = process.env.ORIGIN ?? 'http://localhost:5173';
		app.socle.journaliseur.info('lien_initial', { lien: `${origine}/invitation/${r.valeur}` });
	}
};

function adresseDe(event: Parameters<Handle>[0]['event']) {
	try {
		return event.getClientAddress();
	} catch {
		return 'inconnue';
	}
}

function cheminDecode(chemin: string) {
	try {
		return decodeURI(chemin);
	} catch {
		return chemin;
	}
}

function refusJson(code: string, status: number) {
	return json({ code, details: {} }, { status });
}

/** Fichiers affichés en iframe : une Pièce, l'aperçu du Document d'AG. */
const APERCUS = new Set(['/fichiers/[sha]', '/(app)/etats/document-ag/pdf']);

const estAction = (request: Request) => request.headers.get('x-sveltekit-action') === 'true';

export const handle: Handle = async ({ event, resolve }) => {
	const app = application();
	const { request, url, cookies } = event;

	const jeton = cookies.get(COOKIE_SESSION);
	const session = jeton ? app.acces.lireSession(app.ctx(null), jeton) : null;
	if (jeton && session?.prolongeeJusquAu) {
		poserCookieSession(cookies, jeton, session.prolongeeJusquAu);
	}
	const acces = session?.acces ?? null;
	event.locals.acces = acces;
	event.locals.refuse = false;
	event.locals.adresse = adresseDe(event);

	// Les écritures JSON ne sont pas couvertes par le contrôle CSRF de Kit (AD-19).
	// `route.id` et non le chemin : Kit route sur le chemin décodé, `/%61pi/` mène au même endroit.
	// Une route inconnue sous `/api/` se refuse aussi : le chemin décodé la reconnaît.
	const api =
		event.route.id?.startsWith('/api/') === true || cheminDecode(url.pathname).startsWith('/api/');
	if (api && request.method !== 'GET' && request.method !== 'HEAD') {
		const attendue = process.env.ORIGIN ?? url.origin;
		if (request.headers.get('origin') !== attendue) return refusJson('origine_refusee', 403);
	}

	const routeId = event.route.id;
	// Le·la compteur·se ne voit pas d'application : son accueil est Mes caisses.
	if (routeId === '/(app)' && acces?.role === 'compteur' && request.method === 'GET') {
		redirect(303, '/mes-caisses');
	}
	if (routeId !== null) {
		switch (deciderRoute(ROUTES[routeId], acces?.role ?? null)) {
			case 'inconnue':
				// Refus par défaut : une route oubliée dans la table n'est pas servie.
				app.socle.journaliseur.erreur('route_sans_droit', { route: routeId });
				return api
					? refusJson('acces_refuse', 403)
					: new Response(message('acces_refuse'), { status: 403 });
			case 'exiger_session':
				// Une action ne recharge pas la page : la saisie reste à l'écran (AD-14).
				if (api || estAction(request) || request.method !== 'GET') {
					return refusJson('session_expiree', 401);
				}
				redirect(303, `/connexion?suite=${encodeURIComponent(url.pathname + url.search)}`);
				break;
			case 'refuser':
				if (api || request.method !== 'GET') return refusJson('acces_refuse', 403);
				// Le rendu calme vient de (app)/+layout.server.ts. Les données restent gardées par droit.
				event.locals.refuse = true;
				break;
			case 'ouvrir':
				break;
		}
	} else if (acces === null && !url.pathname.startsWith('/_app/')) {
		redirect(303, `/connexion?suite=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const demande = cookies.get(COOKIE_THEME) as Theme | undefined;
	// Liste fermée : ce cookie finit dans le HTML.
	const theme = demande && THEMES.includes(demande) ? demande : 'systeme';
	const reponse = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%ape.theme%', theme)
	});

	reponse.headers.set('X-Content-Type-Options', 'nosniff');
	reponse.headers.set('Referrer-Policy', 'same-origin');
	// Une Pièce s'affiche dans le `panneau`, en iframe : `frame-ancestors 'self'` la garde (AD-16).
	reponse.headers.set(
		'X-Frame-Options',
		event.route.id !== null && APERCUS.has(event.route.id) ? 'SAMEORIGIN' : 'DENY'
	);
	return reponse;
};

export const handleError: HandleServerError = (capture) => {
	if (capture.kind === 'app') return capture.error;
	if (capture.kind === 'framework') {
		return { code: 'page_introuvable', message: message('erreur_serveur') };
	}
	const { error } = capture;
	const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
	application().socle.journaliseur.erreur('erreur_serveur', { detail });
	return { code: 'erreur_serveur', message: message('erreur_serveur') };
};
