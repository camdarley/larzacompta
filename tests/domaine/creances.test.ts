import { describe, expect, it } from 'vitest';
import {
	controlerCorrection,
	dateDeReprise,
	deciderCreance,
	deciderReglements,
	exerciceOrigine,
	rattachementPropose,
	resteDu,
	sommeASolder,
	sommesSoldees,
	suivi,
	totalRegle,
	type EntreeCreance
} from '#lib/domaine/creances/index.ts';
import type { CreanceDetteJ, OperationJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { E2025, E2026, REPERE } from './aides/journal.ts';

function creance(partiel: Partial<CreanceDetteJ> = {}): CreanceDetteJ {
	return {
		id: 1,
		sens: 'creance',
		tiers: 'Mairie fictive',
		motif: 'Subvention',
		montant: centimes(30000),
		date: '2026-09-10',
		actionId: null,
		note: null,
		annuleeLe: null,
		reglements: [],
		...partiel
	};
}

const op = (id: number, date: string) => ({ id, date }) as OperationJ;
const regle = (operationId: number, montant: number) => ({
	operationId,
	montant: centimes(montant)
});

describe('F2 : reste dû à une date', () => {
	const c = creance({ reglements: [regle(1, 10000), regle(2, 5000)] });
	const j = { operations: [op(1, '2026-10-01'), op(2, '2026-11-01')] };

	it('F2 : le reste baisse avec les règlements datés au plus tard ce jour', () => {
		expect(resteDu(c, j, '2026-09-15')).toBe(30000);
		expect(resteDu(c, j, '2026-10-01')).toBe(20000);
		expect(resteDu(c, j, '2026-11-01')).toBe(15000);
	});

	it('F2 : une Opération annulée ne règle plus rien, et sort du grand journal', () => {
		expect(resteDu(c, { operations: [op(1, '2026-10-01')] }, '2026-12-01')).toBe(20000);
		expect(totalRegle(c, { operations: [op(1, '2026-10-01')] })).toBe(10000);
	});

	it('F2 : annulée, elle vaut 0 à partir de sa date d’annulation seulement', () => {
		// 2026-10-15 à 23 h UTC est déjà le 16 à Paris.
		const annulee = creance({ annuleeLe: '2026-10-15T23:00:00.000Z' });
		expect(resteDu(annulee, j, '2026-10-15')).toBe(30000);
		expect(resteDu(annulee, j, '2026-10-16')).toBe(0);
	});
});

describe('F1 : règlements', () => {
	const c = creance({ reglements: [regle(1, 10000)] });
	const j = { operations: [op(1, '2026-10-01')], creancesDettes: [c] };
	const part = (montant: number, creanceId = 1) => ({ creanceId, montant: centimes(montant) });

	it('F1 : accepte jusqu’au montant, refuse au-delà', () => {
		expect(deciderReglements([part(20000)], centimes(20000), j).ok).toBe(true);
		expect(deciderReglements([part(20001)], centimes(20001), j)).toEqual({
			ok: false,
			erreur: { code: 'reglement_excessif' }
		});
	});

	it('F1 : deux parts sur la même somme comptent ensemble', () => {
		const r = deciderReglements([part(15000), part(15000)], centimes(30000), j);
		expect(r).toEqual({ ok: false, erreur: { code: 'reglement_excessif' } });
	});

	it('F1 : un règlement annulé libère le reste', () => {
		const sans = { ...j, operations: [] };
		expect(deciderReglements([part(30000)], centimes(30000), sans).ok).toBe(true);
	});

	it('une Créance s’encaisse, une Dette se paie', () => {
		const dette = { ...j, creancesDettes: [creance({ sens: 'dette' })] };
		expect(deciderReglements([part(100)], centimes(-100), dette).ok).toBe(true);
		const refus = { ok: false, erreur: { code: 'reglement_sens' } };
		expect(deciderReglements([part(100)], centimes(100), dette)).toEqual(refus);
		expect(deciderReglements([part(100)], centimes(-100), j)).toEqual(refus);
	});

	it('refuse une somme inconnue, annulée, ou plus de parts que l’Opération n’en porte', () => {
		expect(deciderReglements([], centimes(100), j).ok).toBe(false);
		expect(deciderReglements([part(100, 9)], centimes(100), j)).toEqual({
			ok: false,
			erreur: { code: 'element_introuvable' }
		});
		const annulee = {
			...j,
			creancesDettes: [creance({ annuleeLe: '2026-10-15T10:00:00.000Z' })]
		};
		expect(deciderReglements([part(100)], centimes(100), annulee)).toEqual({
			ok: false,
			erreur: { code: 'creance_annulee' }
		});
		expect(deciderReglements([part(200)], centimes(100), j)).toEqual({
			ok: false,
			erreur: { code: 'reglement_depasse_operation' }
		});
	});

	it('une Opération corrigée doit encore couvrir ses parts, dans le même sens', () => {
		const lies = { creancesDettes: [c] };
		expect(controlerCorrection(7, centimes(1), lies).ok).toBe(true);
		expect(controlerCorrection(1, centimes(10000), lies).ok).toBe(true);
		expect(controlerCorrection(1, centimes(9999), lies)).toEqual({
			ok: false,
			erreur: { code: 'reglement_depasse_operation' }
		});
		expect(controlerCorrection(1, centimes(-10000), lies)).toEqual({
			ok: false,
			erreur: { code: 'reglement_sens' }
		});
	});
});

describe('saisie d’une somme', () => {
	const entree: EntreeCreance = {
		sens: 'dette',
		tiers: 'Sam Fictif',
		motif: 'Avance goûter',
		montant: centimes(4200),
		date: '2026-10-05',
		actionId: null,
		note: null
	};

	it('accepte une date ouverte, repère ou avant tout Exercice', () => {
		expect(deciderCreance(entree, [E2025, E2026]).ok).toBe(true);
		expect(deciderCreance({ ...entree, date: '2024-06-01' }, [REPERE, E2026]).ok).toBe(true);
	});

	it('refuse une date dans un Exercice clôturé', () => {
		expect(deciderCreance({ ...entree, date: '2026-03-01' }, [E2025, E2026])).toEqual({
			ok: false,
			erreur: { code: 'exercice_cloture', details: { exercice: '2025-2026', champ: 'date' } }
		});
	});
});

describe('reprise de l’année passée', () => {
	const REPERE_2025 = { ...REPERE, id: 4, libelle: '2025-2026', anneeDebut: 2025 };

	it('date une somme reprise la veille du premier Exercice tenu', () => {
		expect(dateDeReprise([REPERE, E2026])).toBe('2026-08-31');
		expect(dateDeReprise([E2026, E2025])).toBe('2025-08-31');
		expect(dateDeReprise([REPERE])).toBeNull();
	});

	it('retrouve l’Exercice d’origine, tenu ou repère', () => {
		expect(exerciceOrigine([REPERE_2025, E2026], '2026-10-01')?.id).toBe(E2026.id);
		expect(exerciceOrigine([REPERE, REPERE_2025, E2026], '2026-08-31')?.id).toBe(REPERE_2025.id);
		expect(exerciceOrigine([REPERE, REPERE_2025, E2026], '2025-02-01')?.id).toBe(REPERE.id);
		// Plus ancien que tout repère : le plus proche.
		expect(exerciceOrigine([REPERE_2025, E2026], '2020-02-01')?.id).toBe(REPERE_2025.id);
		expect(exerciceOrigine([REPERE], '2025-02-01')?.id).toBe(REPERE.id);
		expect(exerciceOrigine([E2026], '2020-02-01')).toBeUndefined();
	});

	it('propose le rattachement quand le paiement tombe sur un Exercice ultérieur', () => {
		const exercices = [REPERE_2025, E2026];
		const c = { date: '2026-08-31' };
		expect(rattachementPropose(exercices, c, '2026-10-01')?.id).toBe(REPERE_2025.id);
		expect(rattachementPropose(exercices, { date: '2026-09-15' }, '2026-10-01')).toBeNull();
		expect(rattachementPropose(exercices, c, '2020-01-01')).toBeNull();
		expect(rattachementPropose([E2026], { date: '2020-01-01' }, '2026-10-01')).toBeNull();
	});
});

describe('suivi', () => {
	const actions = [{ id: 3, libelle: 'Kermesse' }];
	const j = {
		operations: [op(1, '2026-10-01')],
		creancesDettes: [
			creance({ id: 1, actionId: 3, reglements: [regle(1, 10000)] }),
			creance({ id: 2, sens: 'dette', montant: centimes(4200) }),
			creance({ id: 3, sens: 'dette', montant: centimes(1000) }),
			creance({ id: 4, montant: centimes(10000), reglements: [regle(1, 10000)] }),
			creance({ id: 5, annuleeLe: '2026-10-01T10:00:00.000Z' }),
			creance({ id: 6, date: '2027-01-01' })
		]
	};

	it('montre le reste dû et les totaux, sans ce qui est soldé, annulé ou à venir', () => {
		const s = suivi(j, actions, '2026-11-01');
		expect(s.aRecevoir.rangees.map((r) => [r.id, r.action, r.reste])).toEqual([
			[1, 'Kermesse', 20000]
		]);
		expect(s.aRecevoir.total).toBe(20000);
		expect(s.aPayer.rangees.map((r) => [r.id, r.action])).toEqual([
			[2, null],
			[3, null]
		]);
		expect(s.aPayer.total).toBe(5200);
		expect(s.date).toBe('2026-11-01');
	});

	it('prépare le solde d’une somme, ou rien si elle est close', () => {
		const repris = { operations: j.operations, exercices: [REPERE, E2026] };
		const c = creance({ date: '2025-02-01', reglements: [regle(1, 10000)], actionId: 3 });
		expect(sommeASolder(c, repris, '2026-11-01')).toEqual({
			id: 1,
			sens: 'creance',
			tiers: 'Mairie fictive',
			motif: 'Subvention',
			actionId: 3,
			reste: 20000,
			rattachementId: REPERE.id,
			exerciceOrigine: REPERE.libelle
		});
		const courante = sommeASolder(creance(), repris, '2026-11-01');
		expect(courante?.rattachementId).toBeNull();
		expect(courante?.exerciceOrigine).toBeNull();
		expect(
			sommeASolder(creance({ annuleeLe: '2026-10-01T10:00:00.000Z' }), repris, '2026-11-01')
		).toBeNull();
		expect(
			sommeASolder(
				creance({ montant: centimes(10000), reglements: [regle(1, 10000)] }),
				repris,
				'2026-11-01'
			)
		).toBeNull();
	});

	it('dit quelles sommes solde une Opération', () => {
		expect(sommesSoldees({ id: 1 }, j).map((s) => [s.creanceId, s.montant])).toEqual([
			[1, 10000],
			[4, 10000]
		]);
		expect(sommesSoldees({ id: 9 }, j)).toEqual([]);
	});
});
