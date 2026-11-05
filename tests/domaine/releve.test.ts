import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import { empreinteLigne, normaliserLibelle } from '#lib/domaine/releve/empreinte.ts';
import { planifierImport, planifierSaisie } from '#lib/domaine/releve/planifier.ts';
import { bornesTrou, trous } from '#lib/domaine/releve/trous.ts';
import type { LigneNormalisee } from '#lib/domaine/releve/types.ts';

const ligne = (partiel: Partial<LigneNormalisee> = {}): LigneNormalisee => ({
	date: '2026-10-05',
	montant: centimes(-1000),
	libelle: 'VIR FICTIF',
	identifiant: null,
	...partiel
});

const enBase = (l: LigneNormalisee) => ({
	identifiantSource: l.identifiant,
	empreinte: empreinteLigne(l)
});

describe('empreinte', () => {
	it('ignore casse, accents et espaces', () => {
		expect(normaliserLibelle('  Remise   chèques ')).toBe('REMISE CHEQUES');
		expect(empreinteLigne(ligne({ libelle: 'vir  fictif' }))).toBe(empreinteLigne(ligne()));
	});

	it('distingue date et montant', () => {
		expect(empreinteLigne(ligne({ date: '2026-10-06' }))).not.toBe(empreinteLigne(ligne()));
		expect(empreinteLigne(ligne({ montant: centimes(1) }))).not.toBe(empreinteLigne(ligne()));
	});
});

describe('planifierImport (AD-9)', () => {
	it('un identifiant connu pour ce Compte : la ligne est connue, quel que soit le reste', () => {
		const plan = planifierImport(
			{ lignes: [ligne({ identifiant: 'X', libelle: 'AUTRE', montant: centimes(5) })] },
			[enBase(ligne({ identifiant: 'X' }))],
			null
		);
		expect(plan).toMatchObject({ connues: 1, nouvelles: [], lues: 1 });
	});

	it('un identifiant répété dans le fichier ne compte qu’une fois', () => {
		const plan = planifierImport(
			{ lignes: [ligne({ identifiant: 'X' }), ligne({ identifiant: 'X' })] },
			[],
			null
		);
		expect(plan.nouvelles).toHaveLength(1);
		expect(plan.connues).toBe(1);
	});

	it('k fois dans le fichier, m fois en base : min(k, m) connues, le reste à confirmer', () => {
		const plan = planifierImport(
			{ lignes: [ligne(), ligne(), ligne()] },
			[enBase(ligne()), enBase(ligne())],
			null
		);
		expect(plan.connues).toBe(2);
		expect(plan.nouvelles.map((l) => l.doublon)).toEqual(['a_confirmer']);
	});

	it('k ≥ 2 sans rien en base : toutes nouvelles, à confirmer', () => {
		const plan = planifierImport({ lignes: [ligne(), ligne()] }, [], null);
		expect(plan.nouvelles.map((l) => l.doublon)).toEqual(['a_confirmer', 'a_confirmer']);
	});

	it('une ligne seule et inconnue n’a rien à confirmer', () => {
		const plan = planifierImport({ lignes: [ligne()] }, [], null);
		expect(plan.nouvelles.map((l) => l.doublon)).toEqual(['non']);
	});

	it('un identifiant nouveau sur une empreinte connue passe à confirmer (OQ-7)', () => {
		const plan = planifierImport(
			{ lignes: [ligne({ identifiant: 'NOUVEAU' })] },
			[enBase(ligne({ identifiant: 'ANCIEN' }))],
			null
		);
		expect(plan.connues).toBe(0);
		expect(plan.nouvelles).toMatchObject([{ doublon: 'a_confirmer', identifiant: 'NOUVEAU' }]);
	});

	it('P6 : une ligne antérieure à l’ancre est écartée et comptée', () => {
		const plan = planifierImport(
			{ lignes: [ligne({ date: '2026-08-31' }), ligne({ date: '2026-09-01' })] },
			[],
			'2026-09-01'
		);
		expect(plan).toMatchObject({ lues: 2, ecartees: 1, dateMin: '2026-09-01' });
		expect(plan.nouvelles).toHaveLength(1);
	});

	it('un fichier vide reste sans dates', () => {
		expect(planifierImport({ lignes: [] }, [], null)).toMatchObject({
			dateMin: null,
			dateMax: null,
			lues: 0
		});
	});

	it('propriété : réimporter le même fichier n’ajoute jamais rien', () => {
		const arbitraire = fc.array(
			fc.record({
				date: fc.constantFrom('2026-10-01', '2026-10-02'),
				montant: fc.constantFrom(-100, 200).map(centimes),
				libelle: fc.constantFrom('A', 'B'),
				identifiant: fc.option(fc.constantFrom('1', '2', '3'), { nil: null })
			}),
			{ maxLength: 12 }
		);
		fc.assert(
			fc.property(arbitraire, (lignes) => {
				const premier = planifierImport({ lignes }, [], null);
				const base = premier.nouvelles.map((l) => ({
					identifiantSource: l.identifiant,
					empreinte: l.empreinte
				}));
				const second = planifierImport({ lignes }, base, null);
				expect(second.nouvelles).toEqual([]);
				expect(second.connues + second.ecartees).toBe(lignes.length);
			})
		);
	});

	it('propriété : lues = nouvelles + connues + écartées', () => {
		const arbitraire = fc.array(
			fc.record({
				date: fc.constantFrom('2026-08-31', '2026-10-01'),
				montant: fc.constantFrom(-100, 200).map(centimes),
				libelle: fc.constantFrom('A', 'B'),
				identifiant: fc.constant(null)
			})
		);
		fc.assert(
			fc.property(arbitraire, arbitraire, (lignes, deja) => {
				const p = planifierImport({ lignes }, deja.map(enBase), '2026-09-01');
				expect(p.nouvelles.length + p.connues + p.ecartees).toBe(p.lues);
			})
		);
	});
});

describe('planifierSaisie', () => {
	it('soumet une ligne saisie aux mêmes doublons, sans l’ignorer', () => {
		expect(planifierSaisie(ligne(), []).doublon).toBe('non');
		expect(planifierSaisie(ligne(), [enBase(ligne())]).doublon).toBe('a_confirmer');
	});
});

describe('trous de dates', () => {
	it('signale un écart de plus de trois semaines entre deux relevés', () => {
		expect(
			trous([
				{ dateMin: '2026-03-20', dateMax: '2026-03-31' },
				{ dateMin: '2026-02-01', dateMax: '2026-03-03' },
				{ dateMin: '2026-05-01', dateMax: '2026-05-31' }
			])
		).toEqual([{ debut: '2026-03-31', fin: '2026-05-01' }]);
		expect(
			trous([
				{ dateMin: '2026-02-01', dateMax: '2026-03-03' },
				{ dateMin: '2026-03-28', dateMax: '2026-04-30' }
			])
		).toEqual([{ debut: '2026-03-03', fin: '2026-03-28' }]);
	});

	it('se tait pour des relevés qui se chevauchent, ou sans relevé', () => {
		expect(trous([])).toEqual([]);
		expect(
			trous([
				{ dateMin: '2026-01-01', dateMax: '2026-03-31' },
				{ dateMin: '2026-02-01', dateMax: '2026-02-10' },
				{ dateMin: '2026-04-05', dateMax: '2026-04-30' }
			])
		).toEqual([]);
	});

	it('se lit comme une phrase', () => {
		expect(bornesTrou({ debut: '2026-03-03', fin: '2026-03-28' })).toEqual({
			debut: '3',
			fin: '28 mars'
		});
		expect(bornesTrou({ debut: '2026-02-28', fin: '2026-04-01' })).toEqual({
			debut: '28 février',
			fin: '1er avril'
		});
	});
});
