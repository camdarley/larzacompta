import { describe, expect, it } from 'vitest';
import { modeleFacture } from '#lib/domaine/factures/document.ts';
import {
	controlerSuite,
	deciderAvoir,
	deciderValidation,
	detailEncaissement,
	montantLigne,
	numeroSuivant,
	rangerFactures,
	totalFacture,
	type CompteurFacture,
	type ContexteNumero
} from '#lib/domaine/factures/index.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import { numeroFactureLu } from '#lib/domaine/releve/references.ts';
import { sommesSignalees } from '#lib/domaine/releve/proposer.ts';
import { journalVide, type CreanceDetteJ } from '#lib/domaine/journal.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';

const ouvert: Exercice = {
	id: 2,
	libelle: '2026-2027',
	anneeDebut: 2026,
	debut: '2026-09-01',
	fin: '2027-08-31',
	statut: 'ouvert'
};
const clos: Exercice = {
	id: 1,
	libelle: '2025-2026',
	anneeDebut: 2025,
	debut: '2025-09-01',
	fin: '2026-08-31',
	statut: 'cloture'
};

const contexte = (compteurs: CompteurFacture[] = []): ContexteNumero => ({
	aujourdhui: '2026-11-04',
	exercices: [clos, ouvert],
	compteurs
});

const brouillon = (partiel = {}) => ({
	valideLe: null,
	tiersNom: 'Cantine fictive',
	dateEmission: '2026-11-02',
	lignes: [{ designation: 'Repas', quantite: 12, prixUnitaire: c(4_50) }],
	...partiel
});

const refus = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);

describe('total d’une Facture', () => {
	it('se calcule en centimes entiers', () => {
		expect(montantLigne({ quantite: 3, prixUnitaire: c(33) })).toBe(99);
		expect(
			totalFacture([
				{ designation: 'A', quantite: 3, prixUnitaire: c(1_10) },
				{ designation: 'B', quantite: 1, prixUnitaire: c(5) }
			])
		).toBe(3_35);
	});
});

describe('numéro (F3)', () => {
	it('suit AAAA-NNN et repart à 1 chaque année civile', () => {
		const compteurs = [{ annee: 2026, dernier: 6, derniereDate: '2026-10-01' }];
		expect(numeroSuivant(compteurs, '2026-11-02').numero).toBe('2026-007');
		expect(numeroSuivant(compteurs, '2027-01-02').numero).toBe('2027-001');
		expect(numeroSuivant([{ ...compteurs[0]!, dernier: 999 }], '2026-12-01').numero).toBe(
			'2026-1000'
		);
	});

	it('refuse une date antérieure à la dernière, même le jour d’avant', () => {
		const c1 = contexte([{ annee: 2026, dernier: 1, derniereDate: '2026-11-03' }]);
		expect(refus(deciderValidation(brouillon(), c1))).toBe('facture_date_anterieure');
		expect(refus(deciderValidation(brouillon({ dateEmission: '2026-11-03' }), c1))).toBeNull();
	});

	it('reste chronologique d’une année à l’autre', () => {
		const c1 = {
			...contexte([{ annee: 2027, dernier: 1, derniereDate: '2027-01-05' }]),
			aujourdhui: '2027-02-01'
		};
		expect(refus(deciderValidation(brouillon({ dateEmission: '2026-12-30' }), c1))).toBe(
			'facture_date_anterieure'
		);
	});

	it('refuse une date à venir, close ou hors Exercice', () => {
		expect(refus(deciderValidation(brouillon({ dateEmission: '2026-11-05' }), contexte()))).toBe(
			'facture_date_future'
		);
		expect(refus(deciderValidation(brouillon({ dateEmission: '2026-05-05' }), contexte()))).toBe(
			'exercice_cloture'
		);
		expect(refus(deciderValidation(brouillon({ dateEmission: '2024-05-05' }), contexte()))).toBe(
			'date_hors_exercice'
		);
	});

	it('refuse ce qui est incomplet ou déjà validé, sans consommer de numéro', () => {
		expect(refus(deciderValidation(brouillon({ tiersNom: ' ' }), contexte()))).toBe(
			'facture_incomplete'
		);
		expect(refus(deciderValidation(brouillon({ dateEmission: null }), contexte()))).toBe(
			'facture_incomplete'
		);
		expect(refus(deciderValidation(brouillon({ lignes: [] }), contexte()))).toBe(
			'facture_sans_montant'
		);
		expect(refus(deciderValidation(brouillon({ valideLe: 'x' }), contexte()))).toBe(
			'facture_validee'
		);
	});

	it('voit un trou ou un doublon dans la suite', () => {
		const compteurs = [{ annee: 2026, dernier: 3, derniereDate: '2026-10-01' }];
		const liste = (...n: string[]) => n.map((numero) => ({ numero }));
		expect(controlerSuite(liste('2026-001', '2026-002', '2026-003'), compteurs)).toEqual([]);
		expect(controlerSuite(liste('2026-001', '2026-003'), compteurs)).toHaveLength(1);
		expect(controlerSuite(liste('2026-001', '2026-001', '2026-003'), compteurs)).toHaveLength(1);
		expect(controlerSuite([{ numero: null }], [])).toEqual([]);
	});
});

describe('Avoir (F5)', () => {
	const f = {
		type: 'facture' as const,
		numero: '2026-001',
		lignes: [{ designation: 'Repas', quantite: 10, prixUnitaire: c(5_00) }]
	};

	it('couvre toute la Facture, entre reste annulé et Dette', () => {
		const r = deciderAvoir(f, false, c(20_00), contexte());
		expect(r).toMatchObject({
			ok: true,
			valeur: { numero: '2026-001', resteAnnule: 30_00, detteOuverte: 20_00, total: 50_00 }
		});
	});

	it('refuse un second Avoir, et un Avoir sur un brouillon ou sur un Avoir', () => {
		expect(refus(deciderAvoir(f, true, c(0), contexte()))).toBe('facture_deja_annulee');
		expect(refus(deciderAvoir({ ...f, numero: null }, false, c(0), contexte()))).toBe(
			'element_introuvable'
		);
		expect(refus(deciderAvoir({ ...f, type: 'avoir' }, false, c(0), contexte()))).toBe(
			'element_introuvable'
		);
	});
});

describe('liste et états', () => {
	it('range les brouillons d’abord, puis la suite à rebours', () => {
		const liste = rangerFactures([
			{ id: 1, numero: '2026-001' },
			{ id: 4, numero: null },
			{ id: 2, numero: '2026-002' },
			{ id: 3, numero: '2027-001' }
		]);
		expect(liste.map((f) => f.id)).toEqual([4, 3, 2, 1]);
	});

	it('dit où en est l’encaissement', () => {
		expect(detailEncaissement({ reste: c(0), encaisse: c(10_00) })).toBe('encaissée');
		expect(detailEncaissement({ reste: c(10_00), encaisse: c(0) })).toBe('à encaisser');
		expect(detailEncaissement({ reste: c(10_00), encaisse: c(5_00) })).toMatch(/^reste 10,00/);
	});
});

describe('document', () => {
	const source = {
		type: 'facture' as const,
		numero: '2026-007',
		provisoire: false,
		date: '2026-11-02',
		tiersNom: 'Cantine fictive',
		tiersAdresse: '1 rue Fictive\n00000 Ailleurs',
		lignes: [{ designation: 'Repas', quantite: 12, prixUnitaire: c(4_50) }],
		identite: { nom: 'APE des Tilleuls', adresse: '', mentions: 'Mention une\n\nMention deux' },
		exercice: '2026-2027'
	};

	it('porte numéro, tiers, total, et une phrase par mention', () => {
		const m = modeleFacture(source);
		expect(m.titre).toBe('Facture n° 2026-007');
		expect(m.parties?.[1]?.lignes).toEqual(['Cantine fictive', '1 rue Fictive', '00000 Ailleurs']);
		expect(m.sections[0]?.tableau?.rangees.at(-1)?.cellules.at(-1)).toEqual({ montant: 54_00 });
		expect(m.sections.at(-1)?.phrases).toEqual(['Mention une', 'Mention deux']);
		expect(m.nomFichier).toBe('facture-2026-007');
	});

	it('un brouillon n’a pas de numéro et porte le filigrane', () => {
		const m = modeleFacture({ ...source, numero: null, provisoire: true });
		expect(m.titre).toBe('Facture');
		expect(m.provisoire).toBe(true);
	});

	it('un Avoir nomme ce qu’il annule', () => {
		const m = modeleFacture({
			...source,
			type: 'avoir',
			numero: '2026-008',
			origine: { numero: '2026-007', dateEmission: '2026-11-02' }
		});
		expect(m.titre).toBe('Avoir n° 2026-008');
		expect(m.sections[0]?.phrases[0]).toContain('2026-007');
	});
});

describe('lecture dans un libellé', () => {
	it('reconnaît un n° de facture sous ses formes bancaires', () => {
		for (const l of ['VIR FACT 2026-007 CANTINE', 'FACTURE 2026 007', 'REF2026007', '2026/7']) {
			expect(numeroFactureLu(l, '2026-007')).toBe(true);
		}
	});

	it('ne confond pas un numéro voisin', () => {
		for (const l of ['FACT 2026-0071', 'FACT 2026-017', 'FACT 12026-007', 'FACT 2025-007']) {
			expect(numeroFactureLu(l, '2026-007')).toBe(false);
		}
	});
});

describe('Créance signalée sur une Ligne de relevé (FR-25)', () => {
	const creance = (partiel: Partial<CreanceDetteJ>): CreanceDetteJ => ({
		id: 1,
		sens: 'creance',
		tiers: 'Cantine fictive',
		motif: 'Facture n° 2026-007',
		montant: c(100_00),
		date: '2026-11-01',
		actionId: null,
		note: null,
		annuleeLe: null,
		reglements: [],
		factureId: 1,
		factureNumero: '2026-007',
		...partiel
	});
	const j = (...creancesDettes: CreanceDetteJ[]) => ({ ...journalVide(), creancesDettes });
	const ligne = (montant: number, libelle = 'VIREMENT') => ({ montant: c(montant), libelle });

	it('signale le même montant, ou le numéro lu', () => {
		expect(sommesSignalees(j(creance({})), ligne(100_00))[0]?.raison).toBe(
			'Même montant que ce qui reste dû'
		);
		expect(sommesSignalees(j(creance({})), ligne(40_00, 'FACT 2026-007'))[0]?.raison).toBe(
			'N° de facture lu dans le libellé, montant différent'
		);
		expect(sommesSignalees(j(creance({})), ligne(100_00, 'FACT 2026-007'))[0]?.raison).toBe(
			'Même montant, n° de facture lu dans le libellé'
		);
	});

	it('se tait sinon, et pour une somme annulée ou de l’autre sens', () => {
		expect(sommesSignalees(j(creance({})), ligne(99_00))).toEqual([]);
		expect(sommesSignalees(j(creance({ annuleeLe: 'x' })), ligne(100_00))).toEqual([]);
		expect(sommesSignalees(j(creance({})), ligne(-100_00))).toEqual([]);
		expect(
			sommesSignalees(j(creance({ sens: 'dette', factureNumero: null })), ligne(-100_00))
		).toHaveLength(1);
	});

	it('met le numéro lu devant, et s’arrête à trois', () => {
		const autres = [2, 3, 4].map((id) => creance({ id, factureNumero: null, date: '2026-10-01' }));
		const r = sommesSignalees(j(...autres, creance({})), ligne(100_00, 'FACT 2026-007'));
		expect(r).toHaveLength(3);
		expect(r[0]?.creanceId).toBe(1);
	});
});
