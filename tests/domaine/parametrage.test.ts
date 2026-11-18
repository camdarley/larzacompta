import { describe, expect, it } from 'vitest';
import {
	ACTIONS_TYPE,
	GROUPES_TYPE,
	NATURES_SYSTEME,
	NATURES_TYPE
} from '#lib/domaine/liste-type.ts';
import { centimes } from '#lib/domaine/montant.ts';
import {
	CODES_SYSTEME,
	deplacer,
	libelleDisponible,
	prochainOrdre,
	soldeAncre
} from '#lib/domaine/parametrage.ts';

describe('libellés', () => {
	const existants = [{ id: 1, libelle: 'CCP' }];

	it('refuse un doublon à la casse près', () => {
		expect(libelleDisponible('ccp', existants)).toEqual({
			ok: false,
			erreur: { code: 'libelle_deja_utilise', details: { champ: 'libelle' } }
		});
	});

	it('ignore l’élément lui-même', () => {
		expect(libelleDisponible('ccp', existants, 1).ok).toBe(true);
	});

	it('traite les accents majuscules', () => {
		const r = libelleDisponible('ÉVÈNEMENTS', [{ id: 1, libelle: 'évènements' }]);
		expect(r.ok).toBe(false);
	});
});

describe('ordre', () => {
	const liste = [
		{ id: 1, ordre: 1 },
		{ id: 2, ordre: 2 },
		{ id: 3, ordre: 2 }
	];

	it('monte et descend en renumérotant sans doublon', () => {
		expect(deplacer(liste, 2, 'monter')).toEqual([
			{ id: 2, ordre: 1 },
			{ id: 1, ordre: 2 },
			{ id: 3, ordre: 3 }
		]);
		expect(deplacer(liste, 1, 'descendre').map((e) => e.id)).toEqual([2, 1, 3]);
	});

	it('ne bouge pas aux extrémités', () => {
		expect(deplacer(liste, 1, 'monter')).toEqual([]);
		expect(deplacer(liste, 3, 'descendre')).toEqual([]);
		expect(deplacer(liste, 9, 'monter')).toEqual([]);
	});

	it('donne le prochain ordre', () => {
		expect(prochainOrdre(liste)).toBe(3);
		expect(prochainOrdre([])).toBe(1);
	});
});

describe('ancre', () => {
	it('part de 0 sans ancre', () => {
		expect(soldeAncre(null)).toBe(0);
		expect(soldeAncre(centimes(150))).toBe(150);
	});
});

describe('liste type', () => {
	it('contient les Groupes de FR-31', () => {
		expect(GROUPES_TYPE).toEqual([
			'Évènements',
			'Subventions',
			'Produits financiers',
			'Fonctionnement',
			'Communes',
			'Élémentaire',
			'Maternelle'
		]);
	});

	it('range chaque élément dans un Groupe connu', () => {
		for (const e of [...NATURES_TYPE, ...ACTIONS_TYPE]) expect(GROUPES_TYPE).toContain(e.groupe);
	});

	it('porte les quatre Natures système, dont une neutre', () => {
		expect(NATURES_SYSTEME.map((n) => n.code).sort()).toEqual([...CODES_SYSTEME].sort());
		expect(NATURES_SYSTEME.filter((n) => n.neutre).map((n) => n.code)).toEqual(['somme_a_rendre']);
	});

	it('ne contient aucune donnée propre à une association', () => {
		const mots = [...NATURES_TYPE, ...ACTIONS_TYPE, ...NATURES_SYSTEME].flatMap((e) =>
			e.libelle.toLowerCase().split(/[\s’']+/)
		);
		// Les noms interdits sont cherchés dans tout le dépôt par tests/projet/donnees-reelles.test.ts.
		expect(mots.filter((m) => /\d/.test(m))).toEqual([]);
		expect(mots).not.toContain('ape');
	});
});
