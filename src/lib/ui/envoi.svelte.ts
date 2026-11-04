import type { SubmitFunction } from '$app/forms';
import { afficherToast } from './toasts.svelte.ts';
import { TEXTES } from '#lib/messages.ts';

type Options = {
	/** Confirmation légère après succès. Par défaut « Enregistré. ». */
	toast?: string | false;
	apres?: () => void;
	/** Vide le formulaire après un succès, utile pour une rangée d'ajout. */
	vider?: boolean;
};

/**
 * État d'envoi d'un formulaire : occupé dès l'envoi, double envoi impossible (UX-DR5),
 * saisie conservée en cas d'erreur.
 */
export function creerEnvoi(options: Options = {}) {
	let occupe = $state(false);

	const soumettre: SubmitFunction = ({ cancel }) => {
		if (occupe) {
			cancel();
			return;
		}
		occupe = true;
		return async ({ result, update }) => {
			await update({ reset: options.vider === true, navigate: false });
			occupe = false;
			if (result.type === 'success') {
				if (options.toast !== false) afficherToast(options.toast ?? TEXTES.enregistre);
				options.apres?.();
			}
		};
	};

	return {
		get occupe() {
			return occupe;
		},
		soumettre
	};
}
