/**
 * Endpoints JSON des surfaces globales (AD-19). Chaque issue est un cas prévu :
 * le formulaire reste à l'écran, seul le bandeau change.
 */
import type { ErreurMetier } from '#lib/domaine/resultat.ts';

export type Reponse<T> =
	| { type: 'ok'; valeur: T }
	| { type: 'refus'; erreur: ErreurMetier }
	| { type: 'session' }
	| { type: 'reseau' }
	| { type: 'serveur' };

async function interpreter<T>(r: Response): Promise<Reponse<T>> {
	if (r.status === 401) return { type: 'session' };
	if (r.status >= 500) return { type: 'serveur' };
	try {
		const corps = await r.json();
		return r.ok
			? { type: 'ok', valeur: corps as T }
			: { type: 'refus', erreur: corps as ErreurMetier };
	} catch {
		return { type: 'serveur' };
	}
}

export async function envoyer<T>(url: string, corps?: unknown): Promise<Reponse<T>> {
	try {
		const r = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: corps === undefined ? undefined : JSON.stringify(corps)
		});
		return await interpreter<T>(r);
	} catch {
		return { type: 'reseau' };
	}
}

export async function demander<T>(url: string): Promise<Reponse<T>> {
	try {
		return await interpreter<T>(await fetch(url));
	} catch {
		return { type: 'reseau' };
	}
}
