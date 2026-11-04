import { goto } from '$app/navigation';
import { page } from '$app/state';

/** L'état ouvert d'un `panneau` vit dans l'URL : recharger ou revenir en arrière le retrouve. */
export function urlAvec(parametres: Record<string, string | null>): string {
	const url = new URL(page.url.href);
	for (const [nom, valeur] of Object.entries(parametres)) {
		if (valeur === null) url.searchParams.delete(nom);
		else url.searchParams.set(nom, valeur);
	}
	return url.pathname + url.search;
}

export function changerUrl(parametres: Record<string, string | null>) {
	return goto(urlAvec(parametres), { reset: false });
}
