/**
 * Table `routes → droit` (AD-15), lue par hooks.server.ts.
 * Une route absente d'ici est refusée, même si son code existe.
 */
import type { RegleRoute } from './domaine/droits.ts';

export const ROUTES: Readonly<Record<string, RegleRoute>> = {
	'/sante': 'publique',
	'/manifest.webmanifest': 'publique'
};
