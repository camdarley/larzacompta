import type { Journaliseur } from '../application/ports.ts';

/** Logs JSON sur stdout, sans montant ni donnée personnelle (AD-21). */
export function creerJournaliseur(horodater: () => string): Journaliseur {
	const ecrire = (niveau: string, message: string, champs?: Record<string, unknown>) => {
		console.log(JSON.stringify({ le: horodater(), niveau, message, ...champs }));
	};
	return {
		info: (message, champs) => ecrire('info', message, champs),
		erreur: (message, champs) => ecrire('erreur', message, champs)
	};
}
