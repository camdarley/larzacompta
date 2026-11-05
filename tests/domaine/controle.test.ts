import { describe, expect, it } from 'vitest';
import {
	bilan,
	carteCompte,
	cartesComptes,
	dernierPointage,
	lignesNonPointees,
	operationsAnciennes,
	phraseBilan,
	phraseEcart,
	sansReleve,
	type CarteCompte
} from '#lib/domaine/etats/controle.ts';
import type { Constat, GrandJournal, LigneReleveJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { Compte } from '#lib/domaine/parametrage.ts';
import { CCP, E2025, E2026, journal, LIVRET, operationJ } from './aides/journal.ts';

const c = centimes;
const AUJOURDHUI = '2026-11-04';
const CAISSE: Compte = { ...CCP, id: 3, libelle: 'Caisse', type: 'caisse', ordre: 3 };

const constat = (partiel: Partial<Constat> = {}): Constat => ({
	id: 1,
	compteId: 1,
	date: '2026-10-20',
	solde: c(990_00),
	source: 'releve',
	creeLe: '2026-10-21T10:00:00.000Z',
	...partiel
});

const ligneReleve = (partiel: Partial<LigneReleveJ> = {}): LigneReleveJ => ({
	id: 1,
	compteId: 1,
	date: '2026-10-05',
	montant: c(-10_00),
	libelle: 'Papeterie',
	doublon: 'non',
	importId: 1,
	identifiantSource: null,
	empreinte: 'e',
	...partiel
});

function carte(j: GrandJournal, compte: Compte = CCP, d = AUJOURDHUI) {
	return carteCompte(j, compte, E2026, d);
}

describe('carteCompte', () => {
	it('dit juste quand le solde calculé égale le relevé, pointé', () => {
		const op = operationJ({ date: '2026-10-05', montant: -10_00 });
		const cote = op.cotes[0]!;
		const j = journal({
			operations: [op],
			constats: [constat()],
			lignesReleve: [ligneReleve()],
			pointages: [{ id: 1, compteId: 1, coteIds: [cote.id], ligneReleveIds: [1] }]
		});
		const x = carte(j);
		expect(x).toMatchObject({
			depart: 1000_00,
			mouvements: -10_00,
			calcule: 990_00,
			constate: 990_00,
			ecart: 0,
			etat: 'juste',
			phraseEcart: null,
			nonPointees: 0,
			date: '2026-10-20'
		});
	});

	it('explique un Écart par les lignes non pointées, sans le rassurer', () => {
		const j = journal({
			constats: [constat({ solde: c(987_50) })],
			lignesReleve: [
				ligneReleve({ id: 1, montant: c(-10_00) }),
				ligneReleve({ id: 2, montant: c(-2_50) })
			]
		});
		const x = carte(j);
		expect(x.ecart).toBe(-12_50);
		expect(x.nonExplique).toBe(0);
		expect(x.etat).toBe('a_regarder');
		expect(x.phraseEcart).toMatch(
			/^Écart de 12,50.€\. 2 lignes de relevé non pointées l’expliquent\.$/
		);
	});

	it('passe en Écart quand rien ne l’explique', () => {
		const j = journal({ constats: [constat({ solde: c(900_00) })] });
		const x = carte(j);
		expect(x.etat).toBe('ecart');
		expect(x.nonExplique).toBe(-100_00);
		expect(x.phraseEcart).toContain('Rien de non pointé');
	});

	it('passe un contrôle de plus de 45 jours en À regarder', () => {
		const juste = journal({ constats: [constat({ date: '2026-09-20', solde: c(1000_00) })] });
		expect(carte(juste).ancien).toBe(false);
		const vieux = carte(juste, CCP, '2026-11-05');
		expect(vieux.ancien).toBe(true);
		expect(vieux.etat).toBe('a_regarder');
	});

	it('mesure l’âge d’un contrôle à la fin d’un Exercice passé', () => {
		const j = journal({
			ancres: [{ compteId: 1, exerciceId: E2025.id, solde: c(1000_00) }],
			constats: [constat({ date: '2026-08-20', solde: c(1000_00) })]
		});
		expect(carteCompte(j, CCP, E2025, '2027-03-01').ancien).toBe(false);
	});

	it('ignore un relevé d’un autre Exercice', () => {
		const j = journal({ constats: [constat({ date: '2026-08-20' })] });
		const x = carte(j);
		expect(x.constate).toBeNull();
		expect(x.etat).toBe('a_regarder');
		expect(x.date).toBe(AUJOURDHUI);
	});

	it('suit une caisse par constat, sans Pointage', () => {
		const j = journal({
			comptes: [CCP, CAISSE],
			ancres: [{ compteId: 3, exerciceId: E2026.id, solde: c(50_00) }],
			constats: [constat({ compteId: 3, date: '2026-11-01', solde: c(48_00), source: 'saisie' })]
		});
		const x = carte(j, CAISSE);
		expect(x.ecart).toBe(-2_00);
		expect(x.constate).toBe(48_00);
		expect(x.etat).toBe('ecart');
	});

	it('ramène la date au début d’un Exercice à venir', () => {
		const x = carte(journal(), CCP, '2026-01-01');
		expect(x.date).toBe(E2026.debut);
		expect(x.calcule).toBe(1000_00);
	});
});

describe('phraseEcart', () => {
	it('dit ce qui reste à comprendre', () => {
		const une = { lignes: 1, operations: 0, pointable: true };
		expect(phraseEcart(c(12_50), c(10_00), une)).toMatch(
			/^Écart de 12,50.€\. Après 1 ligne de relevé non pointée, il reste 2,50.€ à comprendre\.$/
		);
		expect(phraseEcart(c(0), c(0), { ...une, lignes: 0 })).toBeNull();
		expect(phraseEcart(c(-5_00), c(-5_00), une)).toMatch(
			/1 ligne de relevé non pointée l’explique\.$/
		);
	});

	it('compte à part les lignes de relevé et les Opérations', () => {
		const phrase = phraseEcart(c(437_99), c(-96_66), {
			lignes: 4,
			operations: 6,
			pointable: true
		});
		expect(phrase).toMatch(
			/Après 4 lignes de relevé et 6 Opérations non pointées, il reste 534,65/
		);
	});

	it('dit ce qui reste à comprendre même quand le solde tombe juste', () => {
		const phrase = phraseEcart(c(0), c(100_00), { lignes: 0, operations: 1, pointable: true });
		expect(phrase).toMatch(/^Le solde tombe juste, mais il reste 1 Opération non pointée : 100,00/);
	});

	it('a sa propre phrase pour une caisse, qui n’a pas de relevé', () => {
		const phrase = phraseEcart(c(-10_00), c(0), { lignes: 0, operations: 0, pointable: false });
		expect(phrase).toMatch(/Recomptez/);
		expect(phrase).not.toMatch(/ligne/);
	});
});

const carteFictive = (partiel: Partial<CarteCompte>): CarteCompte => ({
	...carte(journal({ constats: [constat({ solde: c(1000_00) })] })),
	...partiel
});

describe('bilan', () => {
	const sansTache = [{ id: 'lignes' as const, compteur: 0 }];

	it('va du plus grave au plus doux', () => {
		const juste = carteFictive({});
		expect(juste.etat).toBe('juste');
		const faux = carteFictive({ etat: 'ecart' });
		const taches = [
			{ id: 'lignes' as const, compteur: 3 },
			{ id: 'pieces' as const, compteur: 2 }
		];
		expect(phraseBilan(bilan([faux], taches, false))).toBe('1 Compte ne tombe pas juste.');
		expect(phraseBilan(bilan([faux, faux], taches, false))).toBe('2 Comptes ne tombent pas juste.');
		expect(phraseBilan(bilan([juste], taches, false))).toBe('5 petites choses à regarder.');
		expect(phraseBilan(bilan([juste], [{ id: 'pieces', compteur: 1 }], false))).toBe(
			'1 petite chose à regarder.'
		);
		expect(phraseBilan(bilan([juste], sansTache, false))).toBe('Tout est à jour.');
		expect(phraseBilan(bilan([juste], sansTache, true))).toBe(
			'Importez votre premier relevé pour commencer le contrôle.'
		);
	});

	it('n’est jamais rassurante avec un Écart, même expliqué, ou un contrôle ancien', () => {
		const expliquee = carteFictive({ etat: 'a_regarder', ecart: c(5_00), nonExplique: c(0) });
		expect(bilan([expliquee], sansTache, false)).toEqual({ type: 'taches', nombre: 1 });
		const ancien = carteFictive({ etat: 'a_regarder', ancien: true });
		expect(bilan([ancien], sansTache, false).type).toBe('taches');
	});

	it('ne compte pas deux fois un Écart que des lignes expliquent déjà', () => {
		const couverte = carteFictive({ etat: 'a_regarder', ecart: c(5_00), nonPointees: 2 });
		const taches = [{ id: 'lignes' as const, compteur: 2 }];
		expect(bilan([couverte], taches, false)).toEqual({ type: 'taches', nombre: 2 });
	});

	it('sans relevé, ne compte pas les Comptes qui l’attendent', () => {
		const attente = carteFictive({ etat: 'a_regarder', constate: null, ecart: null });
		expect(bilan([attente], sansTache, true)).toEqual({ type: 'premier_releve' });
	});
});

describe('tuiles', () => {
	it('compte les lignes non pointées jusqu’à la fin de l’Exercice', () => {
		const j = journal({
			lignesReleve: [
				ligneReleve({ id: 1 }),
				ligneReleve({ id: 2 }),
				ligneReleve({ id: 3, date: '2027-10-01' })
			],
			pointages: [{ id: 1, compteId: 1, coteIds: [], ligneReleveIds: [2] }]
		});
		expect(lignesNonPointees(j, E2026)).toBe(1);
		expect(dernierPointage(j, E2026)).toBe('2026-10-05');
		expect(dernierPointage(journal(), E2026)).toBeNull();
	});

	it('repère les Opérations non pointées antérieures au dernier relevé', () => {
		const vieille = operationJ({ date: '2026-09-15' });
		const pointee = operationJ({ date: '2026-09-16' });
		const recente = operationJ({ date: '2026-10-15' });
		const j = journal({
			operations: [vieille, pointee, recente],
			pointages: [{ id: 1, compteId: 1, coteIds: [pointee.cotes[0]!.id], ligneReleveIds: [1] }]
		});
		const debuts = new Map([[1, '2026-10-01']]);
		expect(operationsAnciennes(j, debuts, E2026)).toEqual([vieille.id]);
		expect(operationsAnciennes(j, new Map(), E2026)).toEqual([]);
	});

	it('sait qu’aucun relevé n’existe sur l’Exercice', () => {
		const vide = journal();
		expect(sansReleve(vide, cartesComptes(vide, E2026, AUJOURDHUI), E2026)).toBe(true);
		const lignes = journal({ lignesReleve: [ligneReleve()] });
		expect(sansReleve(lignes, cartesComptes(lignes, E2026, AUJOURDHUI), E2026)).toBe(false);
		const caisse = journal({ comptes: [CAISSE], ancres: [] });
		expect(sansReleve(caisse, cartesComptes(caisse, E2026, AUJOURDHUI), E2026)).toBe(false);
	});
});

describe('cartesComptes', () => {
	it('écarte un Compte ancré plus tard, désactivé, ou sans contrôle', () => {
		const j = journal({
			comptes: [
				CCP,
				LIVRET,
				{ ...LIVRET, id: 4, actif: false },
				{ ...LIVRET, id: 5, type: 'cheques_a_remettre' }
			],
			ancres: [{ compteId: 2, exerciceId: E2026.id, solde: c(0) }]
		});
		expect(cartesComptes(j, E2025, AUJOURDHUI).map((x) => x.compte.id)).toEqual([1]);
		expect(cartesComptes(j, E2026, AUJOURDHUI).map((x) => x.compte.id)).toEqual([1, 2]);
	});
});
