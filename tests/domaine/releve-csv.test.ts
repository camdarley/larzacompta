import { describe, expect, it } from 'vitest';
import {
	appliquerReglage,
	lireDateCsv,
	lireMontantCsv,
	reglagePropose,
	type ReglageCsv
} from '#lib/domaine/releve/csv.ts';

const UNIQUE: ReglageCsv = {
	date: 'Date',
	libelle: 'Libellé',
	identifiant: null,
	montant: { mode: 'unique', colonne: 'Montant' }
};

describe('lireMontantCsv', () => {
	it.each([
		['1 234,56', 123456],
		['1 234,56', 123456],
		['1 234,56', 123456],
		['1234.56', 123456],
		['1.234,56', 123456],
		['1,234.56', 123456],
		['-12,50', -1250],
		['−12,50', -1250],
		['12,50-', -1250],
		['+3', 300],
		['0,1', 10],
		['12,50 €', 1250],
		['1000', 100000],
		['0,07', 7],
		['1 000 000,00', 100000000]
	])('%s', (texte, attendu) => {
		expect(lireMontantCsv(texte)).toBe(attendu);
	});

	it.each(['abc', '', '12,5,6', '1.23.4', '12,345,6'])('refuse « %s »', (t) => {
		expect(lireMontantCsv(t)).toBeNull();
	});

	it('reste exact sur les centimes où un flottant se tromperait', () => {
		expect(lireMontantCsv('1,15')).toBe(115);
		expect(lireMontantCsv('19,99')).toBe(1999);
		expect(lireMontantCsv('4,35')).toBe(435);
	});

	it('refuse un nombre hors des entiers sûrs', () => {
		expect(lireMontantCsv('99999999999999999999')).toBeNull();
	});
});

describe('lireDateCsv', () => {
	it.each([
		['12/03/2026', '2026-03-12'],
		['1/3/2026', '2026-03-01'],
		['12-03-2026', '2026-03-12'],
		['12.03.26', '2026-03-12'],
		['2026-03-12', '2026-03-12'],
		['2026-03-12T10:00:00', '2026-03-12'],
		['12/03/2026 10:00', '2026-03-12']
	])('%s', (texte, attendu) => {
		expect(lireDateCsv(texte)).toBe(attendu);
	});

	it.each(['31/02/2026', 'demain', '2026/03'])('refuse %s', (t) => {
		expect(lireDateCsv(t)).toBeNull();
	});
});

describe('appliquerReglage', () => {
	const tableau = {
		entetes: ['Date', 'Libellé', 'Montant'],
		lignes: [
			['12/03/2026', 'VIR  FICTIF', '-1 000,00'],
			['13/03/2026', '', '20,00'],
			['14/03/2026', 'Sans mouvement', '0,00'],
			['', 'Total', '-980,00']
		]
	};

	it('lit une colonne Montant, écarte total et lignes à zéro', () => {
		const r = appliquerReglage(tableau, UNIQUE);
		expect(r).toEqual({
			ok: true,
			valeur: {
				solde: null,
				lignes: [
					{ date: '2026-03-12', montant: -100000, libelle: 'VIR FICTIF', identifiant: null },
					{ date: '2026-03-13', montant: 2000, libelle: 'Sans libellé', identifiant: null }
				]
			}
		});
	});

	it('lit les colonnes séparées Sorties et Entrées, avec ou sans signe', () => {
		const r = appliquerReglage(
			{
				entetes: ['Date', 'Libellé', 'Réf', 'Sorties', 'Entrées'],
				lignes: [
					['12/03/2026', 'A', 'R1', '10,00', ''],
					['13/03/2026', 'B', 'R2', '-5,00', ''],
					['14/03/2026', 'C', '', '', '7,00']
				]
			},
			{
				...UNIQUE,
				identifiant: 'Réf',
				montant: { mode: 'separees', sorties: 'Sorties', entrees: 'Entrées' }
			}
		);
		expect(r.ok && r.valeur.lignes.map((l) => [l.montant, l.identifiant])).toEqual([
			[-1000, 'R1'],
			[-500, 'R2'],
			[700, null]
		]);
	});

	it('une colonne disparue refuse tout le fichier, et la nomme', () => {
		expect(
			appliquerReglage({ entetes: ['Date', 'Libellé', 'Valeur'], lignes: [] }, UNIQUE)
		).toEqual({ ok: false, erreur: { code: 'format_change', details: { colonne: 'Montant' } } });
	});

	it.each([
		['montant illisible', ['12/03/2026', 'A', 'douze']],
		['date illisible', ['bientôt', 'A', '12,00']]
	])('%s : rien de partiel', (_, rangee) => {
		const r = appliquerReglage({ entetes: tableau.entetes, lignes: [rangee] }, UNIQUE);
		expect(r).toEqual({ ok: false, erreur: { code: 'fichier_illisible' } });
	});

	it('un montant illisible en colonne séparée refuse aussi', () => {
		const r = appliquerReglage(
			{ entetes: ['Date', 'Libellé', 'S', 'E'], lignes: [['12/03/2026', 'A', 'x', '']] },
			{ ...UNIQUE, montant: { mode: 'separees', sorties: 'S', entrees: 'E' } }
		);
		expect(r.ok).toBe(false);
	});

	it('un tableau sans mouvement est illisible', () => {
		expect(appliquerReglage({ entetes: tableau.entetes, lignes: [] }, UNIQUE).ok).toBe(false);
	});
});

describe('reglagePropose', () => {
	it('devine une colonne Montant', () => {
		expect(reglagePropose(['Date opération', 'Libellé', 'Montant(EUROS)'])).toEqual({
			date: 'Date opération',
			libelle: 'Libellé',
			identifiant: null,
			montant: { mode: 'unique', colonne: 'Montant(EUROS)' }
		});
	});

	it('devine des colonnes séparées', () => {
		expect(reglagePropose(['Date', 'Intitulé', 'Référence', 'Sorties', 'Entrées'])).toMatchObject({
			identifiant: null,
			montant: { mode: 'separees', sorties: 'Sorties', entrees: 'Entrées' }
		});
	});

	it('ne prend pas une Référence pour un identifiant : un prélèvement la répète chaque mois', () => {
		expect(reglagePropose(['Date', 'Libellé', 'Référence', 'Montant']).identifiant).toBeNull();
		expect(reglagePropose(['Date', 'Libellé', 'Identifiant', 'Montant']).identifiant).toBe(
			'Identifiant'
		);
	});

	it('se rabat sur la position des colonnes', () => {
		expect(reglagePropose(['A', 'B', 'C'])).toEqual({
			date: 'A',
			libelle: 'B',
			identifiant: null,
			montant: { mode: 'unique', colonne: 'C' }
		});
		expect(reglagePropose([])).toMatchObject({ date: '', libelle: '' });
		expect(reglagePropose(['Seule'])).toMatchObject({ libelle: 'Seule' });
	});
});
