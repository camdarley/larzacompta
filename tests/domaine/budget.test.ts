import { describe, expect, it } from 'vitest';
import {
	cleBudget,
	ecartBudget,
	formaterPourcentage,
	lignesDepuisRealise,
	realiseDe,
	vueBudget,
	type LigneBudget
} from '#lib/domaine/budget/index.ts';
import { modeleBudget } from '#lib/domaine/budget/document.ts';
import type { CompteDeResultat, NoeudNature } from '#lib/domaine/etats/resultat.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { centimes as c } from '#lib/domaine/montant.ts';

const parametrage = {
	groupes: [
		{ id: 2, libelle: 'Fonctionnement', ordre: 2 },
		{ id: 1, libelle: 'Évènements', ordre: 1 }
	],
	actions: [
		{ id: 10, libelle: 'Tombola', groupeId: 2 },
		{ id: 11, libelle: 'Kermesse', groupeId: 1 }
	],
	natures: [
		{ id: 20, libelle: 'Buvette', groupeId: 1, neutre: false },
		{ id: 21, libelle: 'Assurance', groupeId: 2, neutre: false }
	]
};

const nature = (natureId: number, recettes: number, depenses: number): NoeudNature => ({
	natureId,
	libelle: `Nature ${natureId}`,
	recettes: c(recettes),
	depenses: c(depenses),
	resultat: c(recettes - depenses),
	lignes: []
});

const cr = {
	exerciceId: 1,
	recettes: c(0),
	depenses: c(0),
	resultat: c(120_00),
	groupes: [
		{
			groupeId: 1,
			libelle: 'Évènements',
			recettes: c(0),
			depenses: c(0),
			resultat: c(0),
			actions: [
				{
					actionId: 11,
					libelle: 'Kermesse',
					recettes: c(0),
					depenses: c(0),
					resultat: c(0),
					natures: [nature(20, 300_00, 100_00)]
				}
			],
			sansAction: [nature(21, 0, 80_00)]
		}
	],
	anterieurs: { recettes: c(0), depenses: c(0), resultat: c(0), groupes: [] },
	neutres: c(0),
	anomalies: []
} satisfies CompteDeResultat;

const ligne = (
	actionId: number | null,
	natureId: number,
	sens: 'recette' | 'depense',
	montant: number
): LigneBudget => ({ actionId, natureId, sens, montant: c(montant) });

describe('Budget, écart au prévu', () => {
	it('donne 250,00 € et 25 % pour 1 000 € prévus et 1 250 € réalisés', () => {
		const e = ecartBudget(c(1_000_00), c(1_250_00));
		expect(e.difference).toBe(25_000);
		expect(Number.isInteger(e.difference)).toBe(true);
		expect(e.pourcentage).toBe(25);
		expect(formaterPourcentage(e.pourcentage as number)).toBe('+ 25 %');
	});

	it('écrit un pourcentage négatif avec le vrai signe moins', () => {
		expect(formaterPourcentage(-12)).toBe('− 12 %');
		expect(formaterPourcentage(0)).toBe('0 %');
	});

	it('ne donne aucun pourcentage sans prévu', () => {
		expect(ecartBudget(null, c(5_00))).toMatchObject({ difference: 5_00, pourcentage: null });
		expect(ecartBudget(c(0), c(5_00)).pourcentage).toBeNull();
	});

	it('arrondit le pourcentage d’affichage à l’entier', () => {
		expect(ecartBudget(c(300), c(400)).pourcentage).toBe(33);
		expect(ecartBudget(c(300), c(200)).pourcentage).toBe(-33);
	});
});

describe('Budget, réalisé', () => {
	it('sépare recette et dépense d’une même Nature, Action comprise', () => {
		expect(realiseDe(cr)).toEqual([
			ligne(11, 20, 'recette', 300_00),
			ligne(11, 20, 'depense', 100_00),
			ligne(null, 21, 'depense', 80_00)
		]);
	});

	it('remplit le Prévu avec le réalisé, sans retenir ce qui ne se prévoit pas', () => {
		const realise = [
			ligne(11, 20, 'recette', 300_00),
			ligne(10, 20, 'recette', 50_00),
			ligne(11, 21, 'depense', -5_00),
			ligne(null, 21, 'depense', 80_00)
		];
		expect(
			lignesDepuisRealise(realise, { actions: new Set([11]), natures: new Set([20, 21]) })
		).toEqual([ligne(11, 20, 'recette', 300_00), ligne(null, 21, 'depense', 80_00)]);
	});
});

describe('Budget, vue', () => {
	const vue = vueBudget({
		prevus: [
			ligne(11, 20, 'depense', 80_00),
			ligne(11, 20, 'recette', 400_00),
			ligne(10, 21, 'depense', 30_00)
		],
		realise: realiseDe(cr),
		parametrage
	});

	it('range les Actions par Groupe, et « Sans Action » en dernier', () => {
		expect(vue.blocs.map((b) => b.libelle)).toEqual(['Kermesse', 'Tombola', 'Sans Action']);
	});

	it('garde une rangée Recette et une rangée Dépense pour une même Nature', () => {
		const rangees = vue.blocs[0]?.rangees ?? [];
		expect(rangees.map((r) => [r.libelle, r.sens])).toEqual([
			['Buvette', 'recette'],
			['Buvette', 'depense']
		]);
	});

	it('signale une dépense au-delà du prévu, jamais une recette', () => {
		const [recette, depense] = vue.blocs[0]?.rangees ?? [];
		expect(depense).toMatchObject({ depassement: true, difference: 20_00, pourcentage: 25 });
		expect(recette).toMatchObject({ depassement: false, difference: -100_00 });
		expect(vue.blocs[0]?.depassement).toBe(true);
		expect(vue.blocs[1]?.depassement).toBe(false);
	});

	it('ne signale rien sans prévu : pendant la préparation, tout serait À regarder', () => {
		expect(vue.blocs[2]?.rangees[0]).toMatchObject({
			prevu: null,
			depassement: false,
			pourcentage: null,
			part: 0
		});
	});

	it('signale une dépense sur un prévu à zéro', () => {
		const zero = vueBudget({
			prevus: [ligne(11, 20, 'depense', 0)],
			realise: realiseDe(cr),
			parametrage
		});
		expect(zero.blocs[0]?.rangees.at(-1)).toMatchObject({ depassement: true, part: 100 });
	});

	it('borne la barre de réalisé', () => {
		const [recette, depense] = vue.blocs[0]?.rangees ?? [];
		expect(recette?.part).toBe(75);
		expect(depense?.part).toBe(100);
	});

	it('additionne recettes et dépenses, et se raccorde au résultat réel', () => {
		expect(vue.totaux.recettes).toMatchObject({ prevu: 400_00, realise: 300_00 });
		expect(vue.totaux.depenses).toMatchObject({ prevu: 110_00, realise: 180_00 });
		expect(vue.totaux.resultat).toMatchObject({ prevu: 290_00, realise: 120_00 });
	});

	it('donne à une Action son résultat prévu et réalisé', () => {
		expect(vue.blocs[0]).toMatchObject({ prevu: 320_00, realise: 200_00, difference: -120_00 });
	});

	it('laisse vide le prévu d’une Action qui n’en a pas', () => {
		const seule = vueBudget({ prevus: [], realise: realiseDe(cr), parametrage });
		expect(seule.blocs[0]?.prevu).toBeNull();
		expect(seule.totaux.resultat.prevu).toBeNull();
	});

	it('montre une Action encore vide si on le demande', () => {
		const a = vueBudget({ prevus: [], realise: [], parametrage, vides: [10, null] });
		expect(a.blocs.map((b) => b.libelle)).toEqual(['Tombola', 'Sans Action']);
		expect(a.blocs[0]?.rangees).toEqual([]);
	});

	it('identifie une rangée sans ambiguïté, sans Action comprise', () => {
		expect(cleBudget(ligne(null, 21, 'depense', 0))).toBe('s-n21-depense');
		expect(cleBudget(ligne(11, 21, 'recette', 0))).toBe('a11-n21-recette');
	});
});

describe('Budget, document', () => {
	const exercice: Exercice = {
		id: 1,
		libelle: '2026-2027',
		anneeDebut: 2026,
		debut: '2026-09-01',
		fin: '2027-08-31',
		statut: 'ouvert'
	};

	it('porte Prévu, Réalisé, Différence et pourcentage', () => {
		const vue = vueBudget({
			prevus: [ligne(11, 20, 'depense', 80_00)],
			realise: realiseDe(cr),
			parametrage
		});
		const m = modeleBudget(vue, exercice, 'APE imaginaire');
		const t = m.sections[0]?.tableau;
		expect(t?.colonnes.map((x) => x.libelle)).toEqual([
			'Libellé',
			'Prévu',
			'Réalisé',
			'Différence',
			'%'
		]);
		const buvette = t?.rangees.find((r) => r.cellules[0] === 'Buvette, dépense');
		expect(buvette?.cellules.slice(1)).toEqual([
			{ montant: 80_00, signe: false },
			{ montant: 100_00, signe: false },
			{ montant: 20_00, signe: true },
			'+ 25 %'
		]);
		expect(t?.rangees.at(-1)?.cellules[0]).toBe('Résultat');
	});
});
