import { describe, expect, it } from 'vitest';
import {
	activiteAEcrire,
	apresEchec,
	expirationLien,
	expirationSession,
	lirePreferences,
	revocationPermise,
	sessionExpiree,
	tentativeAutorisee,
	verifierMotDePasse,
	type Tentative
} from '#lib/domaine/acces.ts';

const T0 = '2026-11-04T10:00:00.000Z';
const minutes = (n: number) => new Date(Date.parse(T0) + n * 60_000).toISOString();
const jours = (n: number) => minutes(n * 24 * 60);

describe('mot de passe', () => {
	it('exige 12 caractères, sans règle de composition', () => {
		expect(verifierMotDePasse('aaaaaaaaaaaa').ok).toBe(true);
		expect(verifierMotDePasse('aaaaaaaaaaa')).toEqual({
			ok: false,
			erreur: { code: 'mot_de_passe_court', details: { champ: 'motDePasse' } }
		});
		expect(verifierMotDePasse('éééééééééééé').ok).toBe(true);
	});
});

describe('sessions', () => {
	it('expire après 7 jours d inactivité', () => {
		expect(expirationSession(T0, T0)).toBe(jours(7));
		expect(expirationSession(T0, jours(5))).toBe(jours(12));
	});

	it('expire au plus tard après 30 jours', () => {
		expect(expirationSession(T0, jours(28))).toBe(jours(30));
	});

	it('dit si une échéance est passée', () => {
		expect(sessionExpiree(jours(7), jours(7))).toBe(true);
		expect(sessionExpiree(jours(7), minutes(7 * 24 * 60 - 1))).toBe(false);
	});

	it("n'écrit l'activité qu'une fois par minute", () => {
		expect(activiteAEcrire(T0, minutes(0.5))).toBe(false);
		expect(activiteAEcrire(T0, minutes(1))).toBe(true);
	});

	it('donne 7 jours à un lien', () => {
		expect(expirationLien(T0)).toBe(jours(7));
	});
});

describe('limitation des tentatives', () => {
	const repeter = (n: number) => {
		let t: Tentative | null = null;
		for (let i = 0; i < n; i++) t = apresEchec(t, 'id:a', minutes(i));
		return t;
	};

	it('laisse passer neuf échecs', () => {
		expect(tentativeAutorisee(repeter(9), minutes(9))).toBe(true);
		expect(tentativeAutorisee(null, T0)).toBe(true);
	});

	it('bloque au dixième échec, pendant 15 minutes', () => {
		const t = repeter(10);
		expect(tentativeAutorisee(t, minutes(10))).toBe(false);
		expect(tentativeAutorisee(t, minutes(9 + 14))).toBe(false);
		expect(tentativeAutorisee(t, minutes(9 + 15))).toBe(true);
	});

	it('repart de zéro quand la fenêtre est écoulée', () => {
		const t = apresEchec(repeter(5), 'id:a', minutes(30));
		expect(t.echecs).toBe(1);
		expect(t.premiereLe).toBe(minutes(30));
	});
});

describe('A1 : dernier trésorier', () => {
	it('refuse de révoquer le dernier', () => {
		const r = revocationPermise({ id: 1, role: 'tresorier' }, [{ id: 1 }]);
		expect(r).toEqual({ ok: false, erreur: { code: 'dernier_tresorier' } });
	});

	it('permet si un autre reste', () => {
		expect(revocationPermise({ id: 1, role: 'tresorier' }, [{ id: 1 }, { id: 2 }]).ok).toBe(true);
	});

	it('permet toujours pour un autre rôle', () => {
		expect(revocationPermise({ id: 2, role: 'lecteur' }, [{ id: 1 }]).ok).toBe(true);
	});
});

describe('préférences', () => {
	it('tolère un contenu absent ou invalide', () => {
		expect(lirePreferences('{}')).toEqual({ theme: 'systeme', raccourcis: true });
		expect(lirePreferences('pas du json')).toEqual({ theme: 'systeme', raccourcis: true });
		expect(lirePreferences('null')).toEqual({ theme: 'systeme', raccourcis: true });
		expect(lirePreferences('{"theme":"rose"}').theme).toBe('systeme');
	});

	it('lit les choix enregistrés', () => {
		expect(lirePreferences('{"theme":"sombre","raccourcis":false}')).toEqual({
			theme: 'sombre',
			raccourcis: false
		});
	});
});
