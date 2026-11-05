import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import {
	colonneDe,
	exerciceDeDate,
	exerciceDuMouvement,
	groupeDe,
	soldeCompte,
	soldeDepart
} from '#lib/domaine/etats/soldes.ts';
import { E2025, E2026, journal, operationJ, REPERE } from './aides/journal.ts';

const c = centimes;

describe('soldeCompte', () => {
	it('additionne l’ancre et les Côtés datés au plus tard ce jour', () => {
		const j = journal({
			operations: [
				operationJ({ date: '2026-10-05', montant: -1000 }),
				operationJ({ date: '2026-10-20', montant: 5000 })
			]
		});
		expect(soldeCompte(j, 1, '2026-10-04')).toBe(100000);
		expect(soldeCompte(j, 1, '2026-10-05')).toBe(99000);
		expect(soldeCompte(j, 1, '2026-10-31')).toBe(104000);
	});

	it('part de 0 sans ancre', () => {
		expect(soldeCompte(journal({ ancres: [] }), 1, '2026-10-31')).toBe(0);
	});

	it('ignore une Opération annulée, rangée à part', () => {
		const j = journal({ operationsAnnulees: [operationJ({ montant: -1000 })] });
		expect(soldeCompte(j, 1, '2026-10-31')).toBe(100000);
	});

	it('compte chaque Côté d’un Mouvement interne à sa date', () => {
		const j = journal({
			ancres: [
				{ compteId: 1, exerciceId: 1, solde: c(100000) },
				{ compteId: 2, exerciceId: 1, solde: c(0) }
			],
			operations: [
				operationJ({
					genre: 'interne',
					date: '2026-08-31',
					lignes: [],
					cotes: [
						{ id: 1, operationId: 9, compteId: 1, date: '2026-08-31', montant: c(-5000) },
						{ id: 2, operationId: 9, compteId: 2, date: '2026-09-01', montant: c(5000) }
					]
				})
			]
		});
		expect(soldeCompte(j, 1, '2026-08-31')).toBe(95000);
		expect(soldeCompte(j, 2, '2026-08-31')).toBe(0);
		expect(soldeCompte(j, 2, '2026-09-01')).toBe(5000);
	});

	it('(propriété) l’ordre des Opérations ne change rien', () => {
		const lignes = fc.array(
			fc.record({
				jour: fc.integer({ min: 1, max: 28 }),
				montant: fc.integer({ min: -100000, max: 100000 }).filter((m) => m !== 0)
			}),
			{ maxLength: 40 }
		);
		fc.assert(
			fc.property(lignes, fc.integer(), (liste, graine) => {
				const operations = liste.map((l) =>
					operationJ({
						date: `2026-10-${String(l.jour).padStart(2, '0')}`,
						montant: l.montant
					})
				);
				const melangees = [...operations].sort(
					(a, b) => ((a.id * 7919 + graine) % 101) - ((b.id * 7919 + graine) % 101)
				);
				for (const jour of ['2026-10-10', '2026-10-31']) {
					expect(soldeCompte(journal({ operations }), 1, jour)).toBe(
						soldeCompte(journal({ operations: melangees }), 1, jour)
					);
				}
			})
		);
	});
});

describe('soldeDepart', () => {
	it('vaut l’ancre si elle tombe au début de l’Exercice', () => {
		expect(soldeDepart(journal(), 1, E2026)).toBe(100000);
	});

	it('se calcule pour l’Exercice suivant, sans copie', () => {
		const suivant = {
			...E2026,
			id: 4,
			libelle: '2027-2028',
			anneeDebut: 2027,
			debut: '2027-09-01',
			fin: '2028-08-31'
		};
		const j = journal({
			exercices: [E2026, suivant],
			operations: [operationJ({ date: '2026-10-05', montant: -1000 })]
		});
		expect(soldeDepart(j, 1, suivant)).toBe(99000);
	});

	it('vaut l’ancre pour un repère sans dates, 0 sans ancre', () => {
		expect(soldeDepart(journal(), 1, REPERE)).toBe(100000);
		expect(soldeDepart(journal(), 2, REPERE)).toBe(0);
	});
});

describe('Exercice d’un mouvement', () => {
	it('trouve l’Exercice qui contient la date, jamais un repère', () => {
		const j = journal();
		expect(exerciceDuMouvement(j, { date: '2026-03-12' })?.id).toBe(E2025.id);
		expect(exerciceDuMouvement(j, { date: '2026-09-01' })?.id).toBe(E2026.id);
		expect(exerciceDeDate(j.exercices, '2024-10-01')).toBeUndefined();
	});
});

describe('colonneDe', () => {
	it('range une Ligne selon son signe', () => {
		expect(colonneDe({ montant: c(100), estReduction: false })).toBe('recette');
		expect(colonneDe({ montant: c(-100), estReduction: false })).toBe('depense');
	});

	it('range une réduction dans la colonne opposée à son signe (FR-8)', () => {
		expect(colonneDe({ montant: c(2000), estReduction: true })).toBe('depense');
		expect(colonneDe({ montant: c(-2000), estReduction: true })).toBe('recette');
	});
});

describe('groupeDe', () => {
	const p = {
		natures: [{ id: 1, groupeId: 10 }],
		actions: [{ id: 1, groupeId: 20 }]
	};

	it('prend le Groupe de l’Action, sinon celui de la Nature', () => {
		expect(groupeDe({ natureId: 1, actionId: 1 }, p)).toBe(20);
		expect(groupeDe({ natureId: 1, actionId: null }, p)).toBe(10);
	});
});
