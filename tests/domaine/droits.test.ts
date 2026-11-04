import { describe, expect, it } from 'vitest';
import { deciderRoute, MATRICE, peut, ROLES, type Droit, type Role } from '#lib/domaine/droits.ts';

/** Table du §2.2 du PRD, élargie à la consultation du suivi pour le·la lecteur·rice. */
const ATTENDU: [Droit, Role, boolean][] = [
	['saisir', 'tresorier', true],
	['saisir', 'lecteur', false],
	['saisir', 'compteur', false],
	['consulter', 'tresorier', true],
	['consulter', 'lecteur', true],
	['consulter', 'compteur', false],
	['consulter_suivi', 'tresorier', true],
	['consulter_suivi', 'lecteur', true],
	['consulter_suivi', 'compteur', false],
	['compter', 'tresorier', true],
	['compter', 'lecteur', false],
	['compter', 'compteur', true],
	['cloturer_session', 'tresorier', true],
	['cloturer_session', 'lecteur', false],
	['cloturer_session', 'compteur', false],
	['parametrer', 'tresorier', true],
	['parametrer', 'lecteur', false],
	['parametrer', 'compteur', false],
	['etre_connecte', 'tresorier', true],
	['etre_connecte', 'lecteur', true],
	['etre_connecte', 'compteur', true]
];

describe('matrice des droits', () => {
	it.each(ATTENDU)('%s pour %s : %s', (droit, role, attendu) => {
		expect(peut(role, droit)).toBe(attendu);
	});

	it('le test couvre toutes les cases', () => {
		expect(ATTENDU).toHaveLength(Object.keys(MATRICE).length * ROLES.length);
	});
});

describe('deciderRoute', () => {
	it('refuse par défaut une route absente de la table', () => {
		expect(deciderRoute(undefined, 'tresorier')).toBe('inconnue');
		expect(deciderRoute(undefined, null)).toBe('inconnue');
	});

	it('ouvre une route publique sans session', () => {
		expect(deciderRoute('publique', null)).toBe('ouvrir');
	});

	it('exige une session pour toute route non publique', () => {
		expect(deciderRoute('etre_connecte', null)).toBe('exiger_session');
	});

	it('applique le droit du rôle', () => {
		expect(deciderRoute('parametrer', 'tresorier')).toBe('ouvrir');
		expect(deciderRoute('parametrer', 'lecteur')).toBe('refuser');
	});
});
