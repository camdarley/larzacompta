/**
 * Table `routes → droit` (AD-15), lue par hooks.server.ts.
 * Une route absente d'ici est refusée, même si son code existe.
 */
import type { RegleRoute } from './domaine/droits.ts';

export const ROUTES: Readonly<Record<string, RegleRoute>> = {
	'/sante': 'publique',
	'/manifest.webmanifest': 'publique',
	'/(public)/connexion': 'publique',
	'/(public)/invitation/[jeton]': 'publique',
	'/deconnexion': 'publique',

	'/(assistant)/bienvenue': 'parametrer',

	'/(app)': 'consulter',
	'/(app)/plus': 'etre_connecte',
	'/(app)/aide': 'etre_connecte',
	'/(app)/preferences': 'etre_connecte',
	'/(app)/journal': 'consulter',
	'/(app)/reglages': 'parametrer',
	'/(app)/reglages/comptes': 'parametrer',
	'/(app)/reglages/natures': 'parametrer',
	'/(app)/reglages/actions': 'parametrer',
	'/(app)/reglages/groupes': 'parametrer',
	'/(app)/reglages/acces': 'parametrer',
	'/(app)/reglages/exercices': 'parametrer'
};
