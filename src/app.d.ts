import type { AccesConnecte } from '#lib/domaine/acces.ts';

declare global {
	namespace App {
		interface Error {
			code: string;
			details?: Record<string, unknown>;
			message: string;
		}
		interface Locals {
			acces: AccesConnecte | null;
			/** Posé par hooks.server.ts quand le rôle n'atteint pas la route. */
			refuse: boolean;
			adresse: string;
		}
	}
}

export {};
