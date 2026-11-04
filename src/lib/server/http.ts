/** Passage du Resultat métier à la réponse HTTP, au même endroit pour toutes les routes. */
import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { AccesConnecte } from '#lib/domaine/acces.ts';
import type { ErreurMetier, Resultat } from '#lib/domaine/resultat.ts';
import { message, messageErreur, type CodeMessage } from '#lib/messages.ts';

export type VueErreur = {
	code: string;
	message: string;
	champs: Record<string, string>;
};

export function vueErreur(erreur: ErreurMetier): VueErreur {
	const champs: Record<string, string> = {};
	const details = erreur.details ?? {};
	if (erreur.code === 'saisie_invalide') {
		for (const [nom, code] of Object.entries(details.champs as Record<string, string>)) {
			champs[nom] = message(code as CodeMessage);
		}
	} else if (typeof details.champ === 'string') {
		champs[details.champ] = messageErreur(erreur);
	}
	return { code: erreur.code, message: messageErreur(erreur), champs };
}

function statut(code: string) {
	if (code === 'acces_refuse') return 403;
	if (code === 'modification_concurrente') return 409;
	return 400;
}

export type EchecFormulaire = { erreur: VueErreur; saisie: Record<string, unknown> };

/** Échec d'une action de formulaire. La saisie repart pour rester à l'écran, sans secret. */
export function refus(
	erreur: ErreurMetier,
	saisie: Record<string, unknown> = {}
): ActionFailure<EchecFormulaire> {
	return fail(statut(erreur.code), { erreur: vueErreur(erreur), saisie });
}

/** Lecture d'une page : un refus ne doit jamais fuiter un demi-écran. */
export function exiger<T>(r: Resultat<T>): T {
	if (r.ok) return r.valeur;
	error(statut(r.erreur.code), { code: r.erreur.code, message: messageErreur(r.erreur) });
}

export function accesRequis(acces: AccesConnecte | null): AccesConnecte {
	if (acces === null) {
		error(401, { code: 'session_expiree', message: message('session_expiree') });
	}
	return acces;
}

export function champsDe(formulaire: FormData): Record<string, string> {
	const champs: Record<string, string> = {};
	for (const [nom, valeur] of formulaire.entries()) {
		if (typeof valeur === 'string') champs[nom] = valeur;
	}
	return champs;
}

/** Une destination après connexion reste dans l'application. */
export function suiteSure(suite: string | null): string {
	if (suite === null || !suite.startsWith('/') || suite.startsWith('//') || suite.includes('\\')) {
		return '/';
	}
	return suite;
}
