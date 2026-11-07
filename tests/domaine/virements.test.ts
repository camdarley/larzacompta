import { describe, expect, it } from 'vitest';
import { journalVide, type GrandJournal, type LigneReleveJ } from '#lib/domaine/journal.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import {
	datesDecalees,
	deciderVirement,
	indexVirements,
	redatable,
	virementCroise
} from '#lib/domaine/releve/virements.ts';
import { vuePointage } from '#lib/domaine/releve/vues.ts';

const exercices = [
	{
		id: 1,
		libelle: '2025-2026',
		anneeDebut: 2025,
		debut: '2025-09-01',
		fin: '2026-08-31',
		statut: 'cloture'
	},
	{
		id: 2,
		libelle: '2026-2027',
		anneeDebut: 2026,
		debut: '2026-09-01',
		fin: '2027-08-31',
		statut: 'ouvert'
	},
	{
		id: 3,
		libelle: '2027-2028',
		anneeDebut: 2027,
		debut: '2027-09-01',
		fin: '2028-08-31',
		statut: 'ouvert'
	}
] as GrandJournal['exercices'];
const comptes = [
	{ id: 1, libelle: 'Courant', type: 'banque' },
	{ id: 2, libelle: 'Livret', type: 'epargne' },
	{ id: 3, libelle: 'Caisse', type: 'caisse' },
	{ id: 4, libelle: 'Réserve', type: 'epargne' }
] as GrandJournal['comptes'];

const ligne = (
	id: number,
	compteId: number,
	date: string,
	montant: number,
	doublon: LigneReleveJ['doublon'] = 'non'
) => ({ id, compteId, date, montant: c(montant), doublon, libelle: 'L' }) as LigneReleveJ;

const journal = (lignesReleve: LigneReleveJ[], pointages: GrandJournal['pointages'] = []) => ({
	lignesReleve,
	pointages,
	comptes,
	exercices
});
const croise = (j: ReturnType<typeof journal>, l: LigneReleveJ) =>
	virementCroise(j, l, indexVirements(j));

describe('virementCroise', () => {
	it('donne le sens vu depuis la ligne active', () => {
		const sortie = ligne(1, 2, '2026-11-04', -100);
		const entree = ligne(2, 1, '2026-11-05', 100);
		const j = journal([sortie, entree]);
		expect(croise(j, entree)).toEqual({
			ligneId: 1,
			compteLibelle: 'Livret',
			date: '2026-11-04',
			sens: 'depuis'
		});
		expect(croise(j, sortie)?.sens).toBe('vers');
	});

	it('préfère la plus proche, puis la plus ancienne saisie', () => {
		const a = ligne(1, 1, '2026-11-10', 100);
		const j = journal([
			a,
			ligne(2, 2, '2026-11-14', -100),
			ligne(3, 2, '2026-11-09', -100),
			ligne(4, 4, '2026-11-09', -100)
		]);
		expect(croise(j, a)?.ligneId).toBe(3);
	});

	it('s’arrête à cinq jours inclus', () => {
		const a = ligne(1, 1, '2026-11-10', 100);
		expect(croise(journal([a, ligne(2, 2, '2026-11-15', -100)]), a)?.ligneId).toBe(2);
		expect(croise(journal([a, ligne(2, 2, '2026-11-16', -100)]), a)).toBeNull();
	});

	it('écarte une ligne pointée, à confirmer, hors Exercice ouvert ou d’une caisse', () => {
		const a = ligne(1, 1, '2026-09-02', 100);
		expect(
			croise(
				journal(
					[a, ligne(2, 2, '2026-09-02', -100)],
					[{ id: 1, compteId: 2, coteIds: [9], ligneReleveIds: [2], creeLe: 'x' }]
				),
				a
			)
		).toBeNull();
		expect(croise(journal([a, ligne(2, 2, '2026-09-02', -100, 'a_confirmer')]), a)).toBeNull();
		expect(croise(journal([a, ligne(2, 2, '2026-08-30', -100)]), a)).toBeNull();
		expect(croise(journal([a, ligne(2, 3, '2026-09-02', -100)]), a)).toBeNull();
		const close = ligne(5, 1, '2026-08-30', 100);
		expect(croise(journal([close, ligne(2, 2, '2026-08-30', -100)]), close)).toBeNull();
		const caisse = ligne(6, 3, '2026-09-02', 100);
		expect(croise(journal([caisse, ligne(2, 2, '2026-09-02', -100)]), caisse)).toBeNull();
	});

	it('nomme un Compte disparu sans planter', () => {
		const a = ligne(1, 1, '2026-11-10', 100);
		const j = journal([a, ligne(2, 2, '2026-11-10', -100)]);
		const index = indexVirements(j);
		expect(
			virementCroise({ ...j, comptes: j.comptes.filter((x) => x.id !== 2) }, a, index)
				?.compteLibelle ?? ''
		).toBe('');
	});
});

describe('deciderVirement', () => {
	const code = (j: ReturnType<typeof journal>, x: number, y: number) => {
		const r = deciderVirement(j, x, y);
		return r.ok ? 'ok' : r.erreur.code;
	};

	it('range sortie et entrée, quel que soit l’ordre', () => {
		const j = journal([ligne(1, 2, '2026-11-04', -100), ligne(2, 1, '2026-11-05', 100)]);
		for (const [x, y] of [
			[1, 2],
			[2, 1]
		] as const) {
			const r = deciderVirement(j, x, y);
			expect(r.ok && [r.valeur.sortie.id, r.valeur.entree.id]).toEqual([1, 2]);
		}
	});

	it('refuse chaque incohérence', () => {
		const base = [ligne(1, 2, '2026-11-04', -100)];
		expect(code(journal(base), 1, 9)).toBe('element_introuvable');
		expect(code(journal([...base, ligne(2, 2, '2026-11-04', 100)]), 1, 2)).toBe(
			'pointage_incoherent'
		);
		expect(code(journal([...base, ligne(2, 1, '2026-11-04', 90)]), 1, 2)).toBe(
			'pointage_incoherent'
		);
		expect(code(journal([...base, ligne(2, 3, '2026-11-04', 100)]), 1, 2)).toBe(
			'pointage_incoherent'
		);
		expect(code(journal([...base, ligne(2, 1, '2026-11-04', 100, 'a_confirmer')]), 1, 2)).toBe(
			'doublon_a_confirmer'
		);
		expect(code(journal([...base, ligne(2, 1, '2026-08-30', 100)]), 1, 2)).toBe(
			'date_hors_exercice'
		);
		expect(
			code(
				journal(
					[...base, ligne(2, 1, '2026-11-04', 100)],
					[{ id: 1, compteId: 1, coteIds: [9], ligneReleveIds: [2], creeLe: 'x' }]
				),
				1,
				2
			)
		).toBe('pointage_incoherent');
	});
});

describe('datesDecalees', () => {
	const operations = (date: string) =>
		[
			{
				id: 7,
				cotes: [{ id: 70, compteId: 2, date, montant: c(-100) }]
			}
		] as unknown as GrandJournal['operations'];
	const pointage = { id: 5, compteId: 2, coteIds: [70], ligneReleveIds: [50], creeLe: 'x' };
	const lignes = [ligne(50, 2, '2026-11-04', -100)];
	const j = (date: string, p: GrandJournal['pointages'] = [pointage]) => ({
		operations: operations(date),
		pointages: p,
		lignesReleve: lignes,
		exercices
	});

	it('repère un Côté daté après le relevé du jour', () => {
		expect(datesDecalees(j('2026-11-05'), 2, '2026-11-04')).toEqual([
			{
				pointageId: 5,
				coteId: 70,
				operationId: 7,
				dateCote: '2026-11-05',
				dateReleve: '2026-11-04',
				montant: -100
			}
		]);
	});

	it('se tait si le calcul le compte déjà, ou sur un autre Compte', () => {
		expect(datesDecalees(j('2026-11-04'), 2, '2026-11-04')).toEqual([]);
		expect(datesDecalees(j('2026-11-05'), 2, '2026-11-05')).toEqual([]);
		expect(datesDecalees(j('2026-11-05'), 1, '2026-11-04')).toEqual([]);
		expect(datesDecalees(j('2026-11-05', []), 2, '2026-11-04')).toEqual([]);
	});

	it('laisse les Pointages groupés et ceux qui changeraient d’Exercice', () => {
		const groupe = { ...pointage, coteIds: [70, 71] };
		expect(datesDecalees(j('2026-11-05', [groupe]), 2, '2026-11-04')).toEqual([]);
		expect(datesDecalees(j('2027-09-02'), 2, '2026-11-04')).toEqual([]);
	});

	it('ignore un Pointage dont un élément a disparu', () => {
		const perdu = { ...pointage, ligneReleveIds: [99] };
		expect(datesDecalees(j('2026-11-05', [perdu]), 2, '2026-11-04')).toEqual([]);
	});
});

describe('redatable', () => {
	it('reste dans un même Exercice ouvert', () => {
		expect(redatable({ exercices }, '2026-11-05', '2026-11-04').ok).toBe(true);
		expect(redatable({ exercices }, '2027-09-02', '2027-08-31').ok).toBe(false);
		expect(redatable({ exercices }, '2026-08-02', '2026-08-01').ok).toBe(false);
		expect(redatable({ exercices }, '2020-01-02', '2020-01-01').ok).toBe(false);
	});
});

describe('vuePointage', () => {
	it('nomme une date décalée et propose la ligne d’en face', () => {
		const j: GrandJournal = {
			...journalVide(),
			comptes,
			exercices,
			lignesReleve: [
				ligne(50, 2, '2026-11-04', -100),
				ligne(51, 2, '2026-11-08', -30),
				ligne(52, 1, '2026-11-08', 30)
			],
			constats: [
				{ id: 1, compteId: 2, date: '2026-11-04', solde: c(-100), source: 'releve' }
			] as GrandJournal['constats'],
			operations: [
				{
					id: 7,
					genre: 'interne',
					origine: 'saisie',
					libelle: 'Virement',
					date: '2026-11-05',
					cotes: [
						{ id: 70, compteId: 2, date: '2026-11-05', montant: c(-100) },
						{ id: 71, compteId: 1, date: '2026-11-05', montant: c(100) }
					],
					lignes: []
				}
			] as unknown as GrandJournal['operations'],
			pointages: [{ id: 5, compteId: 2, coteIds: [70], ligneReleveIds: [50], creeLe: 'x' }]
		};
		const vue = vuePointage(j, 2, { aujourdhui: '2026-11-10', depuis: null, periodes: [] });
		expect(vue.causes?.decalees[0]).toMatchObject({
			pointageId: 5,
			libelle: 'Virement vers Courant'
		});
		expect(vue.lignes.find((l) => l.id === 51)?.virement?.ligneId).toBe(52);
	});
});
