import { describe, expect, it } from 'vitest';
import { aplatir, type Noeud } from '#lib/domaine/etats/arbre.ts';
import {
	basculerComparaison,
	comparerResultats,
	exercicesComparables,
	exercicesCompares
} from '#lib/domaine/etats/comparaison.ts';
import { modeleCompteDeResultat } from '#lib/domaine/etats/documents.ts';
import type {
	CompteDeResultat,
	NoeudAction,
	NoeudGroupe,
	NoeudNature
} from '#lib/domaine/etats/resultat.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { centimes as c } from '#lib/domaine/montant.ts';

const t = (recettes: number, depenses: number) => ({
	recettes: c(recettes),
	depenses: c(depenses),
	resultat: c(recettes - depenses)
});
const nature = (natureId: number, libelle: string, r: number, d: number): NoeudNature => ({
	natureId,
	libelle,
	...t(r, d),
	lignes: []
});
const action = (actionId: number, libelle: string, natures: NoeudNature[]): NoeudAction => {
	const somme = natures.reduce<[number, number]>(
		(s, n) => [s[0] + n.recettes, s[1] + n.depenses],
		[0, 0]
	);
	return { actionId, libelle, ...t(...somme), natures };
};
const groupe = (
	groupeId: number,
	libelle: string,
	actions: NoeudAction[],
	sansAction: NoeudNature[] = []
): NoeudGroupe => {
	const somme = [...actions, ...sansAction].reduce<[number, number]>(
		(s, n) => [s[0] + n.recettes, s[1] + n.depenses],
		[0, 0]
	);
	return { groupeId, libelle, ...t(...somme), actions, sansAction };
};
const etat = (exerciceId: number, groupes: NoeudGroupe[]): CompteDeResultat => ({
	exerciceId,
	...t(
		groupes.reduce((s, g) => s + g.recettes, 0),
		groupes.reduce((s, g) => s + g.depenses, 0)
	),
	groupes,
	anterieurs: { ...t(0, 0), groupes: [] },
	neutres: c(0),
	anomalies: []
});

const exercice = (id: number, anneeDebut: number, statut: Exercice['statut'] = 'cloture') => ({
	id,
	anneeDebut,
	libelle: `${anneeDebut}-${anneeDebut + 1}`,
	debut: statut === 'repere' ? null : `${anneeDebut}-09-01`,
	fin: statut === 'repere' ? null : `${anneeDebut + 1}-08-31`,
	statut
});

const courant = etat(2, [
	groupe(1, 'Évènements', [action(10, 'Kermesse', [nature(20, 'Buvette', 300_00, 100_00)])]),
	groupe(2, 'Vide', [])
]);
const passe = etat(1, [
	groupe(1, 'Évènements', [
		action(10, 'Fête de l’école', [nature(21, 'Lots', 0, 40_00)]),
		action(11, 'Tombola', [nature(20, 'Buvette', 50_00, 0)])
	]),
	groupe(3, 'Ancien Groupe', [], [nature(22, 'Assurance', 0, 10_00)])
]);
const comparaison = comparerResultats(courant, [{ exercice: exercice(1, 2025), resultat: passe }]);
const trouve = (noeuds: readonly Noeud[], cle: string): Noeud | undefined =>
	noeuds.flatMap((n) => [n, ...n.enfants]).find((n) => n.cle === cle) ??
	noeuds
		.flatMap((n) => n.enfants)
		.flatMap((n) => n.enfants)
		.find((n) => n.cle === cle);

describe('Comparaison entre Exercices (FR-34)', () => {
	it('ajoute une colonne par Exercice', () => {
		expect(comparaison.colonnes).toEqual([{ exerciceId: 1, libelle: '2025-2026' }]);
		expect(trouve(comparaison.noeuds, 'g1')?.comparaisons).toEqual([10_00]);
	});

	it('rapproche une Action par identité, même renommée, sous son nom de cette année', () => {
		const kermesse = trouve(comparaison.noeuds, 'a10');
		expect(kermesse?.libelle).toBe('Kermesse');
		expect(kermesse?.resultat).toBe(200_00);
		expect(kermesse?.comparaisons).toEqual([-40_00]);
	});

	it('laisse vide, jamais à zéro, une Action absente de l’Exercice comparé', () => {
		const present = comparerResultats(passe, [{ exercice: exercice(2, 2026), resultat: courant }]);
		expect(trouve(present.noeuds, 'a11')?.comparaisons).toEqual([null]);
	});

	it('montre une Action absente de l’Exercice regardé, vide sur cette année', () => {
		const tombola = trouve(comparaison.noeuds, 'a11');
		expect(tombola).toMatchObject({ absent: true, libelle: 'Tombola', comparaisons: [50_00] });
		expect(aplatir([tombola as Noeud], new Set())[0]?.absent).toBe(true);
	});

	it('réunit les Natures des deux années sous une même Action', () => {
		const natures = trouve(comparaison.noeuds, 'a10')?.enfants ?? [];
		expect(natures.map((n) => [n.libelle, n.absent ?? false, n.comparaisons])).toEqual([
			['Buvette', false, [null]],
			['Lots', true, [-40_00]]
		]);
	});

	it('montre un Groupe disparu, et oublie un Groupe vide partout', () => {
		expect(comparaison.noeuds.map((n) => n.libelle)).toEqual(['Évènements', 'Ancien Groupe']);
		expect(comparaison.noeuds[1]).toMatchObject({ absent: true, comparaisons: [-10_00] });
		expect(comparaison.noeuds[1]?.enfants[0]).toMatchObject({
			cle: 'g3-n22',
			libelle: 'Assurance',
			comparaisons: [-10_00]
		});
	});

	it('garde une Action à sa place de cette année si son Groupe a changé', () => {
		const deplacee = etat(1, [
			groupe(9, 'Autre Groupe', [action(10, 'Kermesse', [nature(20, 'Buvette', 5_00, 0)])])
		]);
		const r = comparerResultats(courant, [{ exercice: exercice(1, 2025), resultat: deplacee }]);
		expect(r.noeuds.map((n) => n.cle)).toEqual(['g1', 'g9']);
		expect(trouve(r.noeuds, 'a10')?.comparaisons).toEqual([5_00]);
		expect(r.noeuds[1]?.enfants).toEqual([]);
	});

	it('termine par le résultat de chaque Exercice', () => {
		expect(comparaison.total).toMatchObject({
			libelle: 'Résultat de l’Exercice',
			resultat: 200_00,
			comparaisons: [0]
		});
	});
});

describe('Choix des Exercices comparés', () => {
	const tous = [
		exercice(1, 2024),
		exercice(2, 2025),
		exercice(3, 2026, 'ouvert'),
		exercice(4, 2023, 'repere')
	];
	const regarde = tous[2] as Exercice;

	it('propose les Exercices tenus, sans repère ni celui regardé', () => {
		expect(exercicesComparables(tous, regarde).map((e) => e.libelle)).toEqual([
			'2025-2026',
			'2024-2025'
		]);
	});

	it('lit l’URL sans rien d’inconnu, le plus récent d’abord', () => {
		const lus = exercicesCompares(
			tous,
			regarde,
			'2024-2025,2099-2100,2023-2024,2026-2027,2025-2026'
		);
		expect(lus.map((e) => e.libelle)).toEqual(['2025-2026', '2024-2025']);
		expect(exercicesCompares(tous, regarde, null)).toEqual([]);
	});

	it('coche et décoche dans l’URL', () => {
		expect(basculerComparaison([], '2025-2026')).toBe('2025-2026');
		expect(basculerComparaison([{ libelle: '2025-2026' }], '2024-2025')).toBe(
			'2025-2026,2024-2025'
		);
		expect(basculerComparaison([{ libelle: '2025-2026' }], '2025-2026')).toBeNull();
	});
});

describe('Export d’une comparaison', () => {
	const m = modeleCompteDeResultat(
		courant,
		exercice(2, 2026, 'ouvert'),
		'APE imaginaire',
		comparaison
	);
	const t0 = m.sections[0]?.tableau;

	it('porte une colonne par Exercice, en paysage', () => {
		expect(m.paysage).toBe(true);
		expect(t0?.colonnes.map((c0) => c0.libelle)).toEqual([
			'Libellé',
			'Recettes',
			'Dépenses',
			'Résultat',
			'2025-2026'
		]);
		expect(m.nomFichier).toBe('compte-de-resultat-2026-2027-comparaison');
	});

	it('laisse vide ce qui est absent, jamais 0,00 €', () => {
		const tombola = t0?.rangees.find((r) => r.cellules[0] === 'Tombola');
		expect(tombola?.cellules).toEqual([
			'Tombola',
			null,
			null,
			null,
			{ montant: 50_00, signe: true }
		]);
		const kermesse = t0?.rangees.find((r) => r.cellules[0] === 'Buvette');
		expect(kermesse?.cellules[4]).toBeNull();
	});

	it('finit par le résultat de chaque Exercice', () => {
		expect(t0?.rangees.at(-1)).toMatchObject({ total: true, fort: true });
		expect(t0?.rangees.at(-1)?.cellules[4]).toEqual({ montant: 0, signe: true });
	});

	it('reste identique sans comparaison', () => {
		const seul = modeleCompteDeResultat(courant, exercice(2, 2026, 'ouvert'), 'APE imaginaire');
		expect(seul.paysage).toBeUndefined();
		expect(seul.sections[0]?.tableau?.colonnes).toHaveLength(4);
	});
});
