import type { SourceVersions } from '../../application/ports.ts';

type Reponse = { tag_name?: unknown; version?: unknown };

/** Lecture anonyme : ni identifiant, ni nom d'APE, ni version en en-tête (AD-21, NFR-8). */
export function creerSourceVersions(url: string, lire: typeof fetch = fetch): SourceVersions {
	return {
		async derniere() {
			if (url === '') return null;
			try {
				const reponse = await lire(url, {
					headers: { accept: 'application/json' },
					signal: AbortSignal.timeout(10_000)
				});
				if (!reponse.ok) return null;
				const corps = (await reponse.json()) as Reponse;
				const version = corps.tag_name ?? corps.version;
				return typeof version === 'string' ? version : null;
			} catch {
				// Une page de versions injoignable ne doit jamais gêner l'application.
				return null;
			}
		}
	};
}
