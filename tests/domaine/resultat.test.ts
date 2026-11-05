import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	anomaliesEquation,
	compteDeResultat,
	detailAction,
	equationDeControle,
	resultatParAction,
	totauxDe,
	type ParametrageEtats
} from '#lib/domaine/etats/resultat.ts';
import { messageAnomalie } from '#lib/domaine/etats/anomalies.ts';
import { groupeDe } from '#lib/domaine/etats/soldes.ts';
import { etatTresorerie } from '#lib/domaine/etats/tresorerie.ts';
import type { GrandJournal, OperationJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { CCP, E2025, E2026, journal, LIVRET, operationJ, REPERE } from './aides/journal.ts';

const c = centimes;

const P: ParametrageEtats = {
	groupes: [
		{ id: 2, libelle: 'Fonctionnement', ordre: 2 },
		{ id: 1, libelle: 'Évènements', ordre: 1 }
	],
	natures: [
		{ id: 1, libelle: 'Transport', groupeId: 2, neutre: false },
		{ id: 2, libelle: 'Buvette', groupeId: 1, neutre: false },
		{ id: 3, libelle: 'Somme à rendre', groupeId: 2, neutre: true }
	],
	actions: [
		{ id: 1, libelle: 'Kermesse', groupeId: 1 },
		{ id: 2, libelle: 'Agrumes', groupeId: 1 }
	],
	comptes: [
		{ id: 1, libelle: 'CCP', type: 'banque', ordre: 1, actif: true },
		{ id: 2, libelle: 'Livret', type: 'epargne', ordre: 2, actif: true }
	]
};

function ligne(op: OperationJ, partiel: Partial<OperationJ['lignes'][number]>): OperationJ {
	return { ...op, lignes: [{ ...(op.lignes[0] as OperationJ['lignes'][number]), ...partiel }] };
}

function jeu(): GrandJournal {
	return journal({
		operations: [
			ligne(operationJ({ montant: 500_00 }), { natureId: 2, actionId: 1 }),
			ligne(operationJ({ montant: -200_00 }), { natureId: 1, actionId: 1 }),
			// Remboursement fournisseur : positif, rangé en Dépense.
			ligne(operationJ({ montant: 20_00 }), { natureId: 1, actionId: 1, estReduction: true }),
			ligne(operationJ({ montant: -50_00 }), { natureId: 1, actionId: null }),
			// Nature neutre : hors résultat.
			ligne(operationJ({ montant: 100_00 }), { natureId: 3, actionId: null }),
			// Rattachée à l'Exercice précédent : bloc séparé.
			ligne(operationJ({ montant: -30_00 }), {
				natureId: 1,
				actionId: 1,
				exerciceRattachementId: E2025.id
			}),
			// Autre Exercice : absent.
			ligne(
				(() => {
					const op = operationJ({ date: '2025-10-01', montant: -999_00 });
					return { ...op, cotes: op.cotes.map((x) => ({ ...x, compteId: 2 })) };
				})(),
				{ natureId: 1, actionId: null, exerciceRattachementId: E2025.id }
			)
		]
	});
}

describe('compteDeResultat', () => {
	const cr = compteDeResultat(jeu(), E2026, P);

	it('suit tous les Groupes, dans leur ordre, même vides', () => {
		expect(cr.groupes.map((g) => g.libelle)).toEqual(['Évènements', 'Fonctionnement']);
		const vide = compteDeResultat(journal(), E2026, P);
		expect(vide.groupes.map((g) => g.libelle)).toEqual(['Évènements', 'Fonctionnement']);
		expect(vide.resultat).toBe(0);
	});

	it('prend les Lignes par exerciceDuMouvement, hors Natures neutres', () => {
		expect(cr.recettes).toBe(500_00);
		// 200,00 − 20,00 + 50,00
		expect(cr.depenses).toBe(230_00);
		expect(cr.resultat).toBe(270_00);
		expect(cr.neutres).toBe(100_00);
	});

	it('sépare le bloc « sur Exercices antérieurs » du résultat', () => {
		expect(cr.anterieurs.resultat).toBe(-30_00);
		expect(cr.anterieurs.groupes.map((g) => g.libelle)).toEqual(['Évènements']);
	});

	it('range une Ligne sans Action dans le Groupe de sa Nature', () => {
		const fonctionnement = cr.groupes.find((g) => g.libelle === 'Fonctionnement');
		expect(fonctionnement?.sansAction.map((n) => n.libelle)).toEqual(['Transport']);
		expect(fonctionnement?.actions).toEqual([]);
	});

	it('range une Action dans son Groupe, Natures et Lignes dessous', () => {
		const kermesse = cr.groupes[0]?.actions.find((a) => a.libelle === 'Kermesse');
		expect(kermesse?.natures.map((n) => n.libelle)).toEqual(['Buvette', 'Transport']);
		expect(kermesse?.natures[1]?.lignes).toHaveLength(2);
		expect(kermesse?.resultat).toBe(320_00);
	});

	it('signale une Ligne sans Groupe connu, et la compte quand même', () => {
		const orphelin = compteDeResultat(jeu(), E2026, { ...P, groupes: [P.groupes[1]!] });
		expect(orphelin.anomalies[0]?.code).toBe('anomalie_groupe');
		expect(orphelin.resultat).toBe(270_00);
		expect(orphelin.groupes.at(-1)?.libelle).toBe('Non rangé');
		expect(messageAnomalie(orphelin.anomalies[0]!)).toContain('1 Ligne n’a pas');
	});

	it('garde une Nature ou une Action inconnue visible', () => {
		const j = journal({ operations: [ligne(operationJ({}), { natureId: 99, actionId: 98 })] });
		expect(compteDeResultat(j, E2026, P).anomalies).toHaveLength(1);
		const r = compteDeResultat(j, E2026, {
			...P,
			actions: [{ id: 98, libelle: 'Connue', groupeId: 1 }]
		});
		expect(r.groupes[0]?.actions[0]?.natures[0]?.libelle).toBe('Non rangé');
		const sansAction = compteDeResultat(j, E2026, {
			...P,
			actions: [],
			natures: [{ id: 99, libelle: 'N', groupeId: 1, neutre: false }]
		});
		expect(sansAction.groupes[0]?.libelle).toBe('Évènements');
	});
});

describe('groupeDe', () => {
	it('prend le Groupe de l’Action, sinon celui de la Nature', () => {
		expect(groupeDe({ natureId: 1, actionId: 1 }, P)).toBe(1);
		expect(groupeDe({ natureId: 1, actionId: null }, P)).toBe(2);
	});
});

describe('totauxDe', () => {
	it('range une réduction de recette dans les Recettes, en moins', () => {
		const t = totauxDe([
			{ montant: c(100_00), estReduction: false },
			{ montant: c(-30_00), estReduction: true }
		]);
		expect(t).toEqual({ recettes: 70_00, depenses: 0, resultat: 70_00 });
	});
});

describe('resultatParAction', () => {
	it('égale le résultat de l’Exercice, Lignes sans Action comprises', () => {
		const r = resultatParAction(jeu(), E2026, P);
		expect(r.resultat).toBe(270_00);
		expect(r.sansActionTotaux.resultat).toBe(-50_00);
		expect(r.sansAction.map((n) => n.libelle)).toEqual(['Transport']);
		expect(r.anomalies).toEqual([]);
	});

	it('retrouve une Action seule, ou rien', () => {
		const r = resultatParAction(jeu(), E2026, P);
		expect(detailAction(r, 1)?.libelle).toBe('Kermesse');
		expect(detailAction(r, 2)).toBeNull();
	});
});

/** Mouvement interne dont les deux dates tombent dans deux Exercices. */
function enTransit(montant: number): OperationJ {
	const base = operationJ({ date: '2026-08-31', montant: 0 });
	return {
		...base,
		genre: 'interne',
		lignes: [],
		cotes: [
			{ id: 9001, operationId: base.id, compteId: 1, date: '2026-08-31', montant: c(-montant) },
			{ id: 9002, operationId: base.id, compteId: 2, date: '2026-09-02', montant: c(montant) }
		]
	};
}

describe('équation de contrôle', () => {
	it('tient avec Lignes antérieures, neutres et Mouvement en transit', () => {
		const j = jeu();
		const x = equationDeControle(j, E2026, P);
		expect(x).toMatchObject({
			resultat: 270_00,
			anterieures: -30_00,
			neutres: 100_00,
			transit: 0,
			variation: 340_00,
			difference: 0
		});
	});

	it('compte séparément les deux Côtés d’un transit', () => {
		const j = journal({
			ancres: [],
			operations: [enTransit(40_00)]
		});
		const avant = equationDeControle(j, E2025, P);
		const apres = equationDeControle(j, E2026, P);
		expect(avant).toMatchObject({ transit: -40_00, variation: -40_00, difference: 0 });
		expect(apres).toMatchObject({ transit: 40_00, variation: 40_00, difference: 0 });
	});

	it('ignore un Mouvement interne entièrement dans l’Exercice', () => {
		const op = enTransit(40_00);
		const j = journal({
			ancres: [],
			operations: [
				{ ...op, cotes: op.cotes.map((x) => ({ ...x, date: '2026-09-02' })), date: '2026-09-02' }
			]
		});
		expect(equationDeControle(j, E2026, P)).toMatchObject({ transit: 0, variation: 0 });
	});

	it('renvoie une anomalie si elle échoue, sans masquer le chiffre', () => {
		const op = operationJ({ montant: -50_00 });
		const fausse = { ...op, lignes: [{ ...op.lignes[0]!, montant: c(-40_00) }] };
		const j = journal({ operations: [fausse] });
		const x = equationDeControle(j, E2026, P);
		expect(x.difference).toBe(-10_00);
		const a = anomaliesEquation(x);
		expect(a[0]?.code).toBe('anomalie_equation');
		expect(messageAnomalie(a[0]!)).toMatch(/10,00/);
		const t = etatTresorerie(j, E2026, P);
		expect(t.anomalies).toHaveLength(1);
		expect(t.variation).toBe(-50_00);
	});
});

describe('etatTresorerie', () => {
	it('donne départ, fin et variation de chaque Compte, et les totaux des restes dus', () => {
		const j = journal({
			...jeu(),
			creancesDettes: [
				{
					id: 1,
					sens: 'creance',
					tiers: 'Commune fictive',
					motif: 'Subvention',
					montant: c(300_00),
					date: '2026-10-01',
					actionId: null,
					note: null,
					annuleeLe: null,
					reglements: []
				},
				{
					id: 2,
					sens: 'dette',
					tiers: 'Autocars',
					motif: 'Reste',
					montant: c(80_00),
					date: '2026-10-01',
					actionId: null,
					note: null,
					annuleeLe: null,
					reglements: []
				},
				{
					id: 3,
					sens: 'dette',
					tiers: 'Plus tard',
					motif: 'Après la fin',
					montant: c(5_00),
					date: '2027-10-01',
					actionId: null,
					note: null,
					annuleeLe: null,
					reglements: []
				}
			]
		});
		const t = etatTresorerie(j, E2026, P);
		expect(t.comptes[0]).toMatchObject({ libelle: 'CCP', depart: 1000_00, fin: 1340_00 });
		expect(t.comptes[0]?.variation).toBe(340_00);
		expect(t.creances).toBe(300_00);
		expect(t.dettes).toBe(80_00);
		expect(t.fin).toBe(341_00);
	});

	it('écarte un Compte désactivé à zéro, et un Compte ancré plus tard', () => {
		const j = journal({ ancres: [{ compteId: 2, exerciceId: E2026.id, solde: c(0) }] });
		const p = {
			...P,
			comptes: [{ ...P.comptes[1]!, actif: false }, P.comptes[0]!]
		};
		expect(etatTresorerie(j, E2026, p).comptes.map((x) => x.libelle)).toEqual(['CCP']);
		const ancre = journal({ ancres: [{ compteId: 1, exerciceId: E2026.id, solde: c(10) }] });
		expect(etatTresorerie(ancre, E2025, P).comptes.map((x) => x.libelle)).toEqual(['Livret']);
	});
});

/** Journal généré : formes réelles, y compris réductions, neutres, rattachements et transits. */
const arbitraireOperation = fc.record({
	jour: fc.integer({ min: 0, max: 700 }),
	montant: fc.integer({ min: -500_000, max: 500_000 }).filter((m) => m !== 0),
	nature: fc.constantFrom(1, 2, 3),
	action: fc.constantFrom(null, 1, 2),
	reduction: fc.boolean(),
	anterieure: fc.boolean(),
	compte: fc.constantFrom(1, 2),
	interne: fc.boolean(),
	ecart: fc.integer({ min: 0, max: 30 })
});

function dateDe(jour: number): string {
	const t = Date.UTC(2025, 8, 1) + jour * 86_400_000;
	return new Date(t).toISOString().slice(0, 10);
}

function genere(ops: fc.TypeOf<typeof arbitraireOperation>[]): GrandJournal {
	return journal({
		exercices: [REPERE, E2025, E2026],
		comptes: [CCP, LIVRET],
		ancres: [
			{ compteId: 1, exerciceId: E2025.id, solde: c(1000_00) },
			{ compteId: 2, exerciceId: E2025.id, solde: c(50_00) }
		],
		operations: ops.map((o, i): OperationJ => {
			const id = i + 1;
			const date = dateDe(o.jour);
			const exercice = date < (E2026.debut as string) ? E2025 : E2026;
			if (o.interne) {
				const autre = o.compte === 1 ? 2 : 1;
				return {
					...operationJ({ id, date, montant: 0 }),
					genre: 'interne',
					lignes: [],
					cotes: [
						{
							id: id * 10,
							operationId: id,
							compteId: o.compte,
							date,
							montant: c(-Math.abs(o.montant))
						},
						{
							id: id * 10 + 1,
							operationId: id,
							compteId: autre,
							date: dateDe(o.jour + o.ecart),
							montant: c(Math.abs(o.montant))
						}
					]
				};
			}
			const rattachement = o.anterieure
				? exercice.id === E2026.id
					? E2025.id
					: REPERE.id
				: exercice.id;
			const base = operationJ({ id, date, montant: o.montant });
			return {
				...base,
				cotes: [{ id: id * 10, operationId: id, compteId: o.compte, date, montant: c(o.montant) }],
				lignes: [
					{
						...base.lignes[0]!,
						natureId: o.nature,
						actionId: o.action,
						estReduction: o.reduction,
						exerciceRattachementId: rattachement
					}
				]
			};
		})
	});
}

describe('propriétés sur tout journal généré', () => {
	const journaux = fc.array(arbitraireOperation, { maxLength: 40 }).map(genere);

	it('FR-30 : la somme par Action égale le résultat', () => {
		fc.assert(
			fc.property(journaux, (j) => {
				for (const e of [E2025, E2026]) {
					const r = resultatParAction(j, e, P);
					const cr = compteDeResultat(j, e, P);
					expect(r.resultat).toBe(cr.resultat);
					expect(r.anomalies).toEqual([]);
					expect(cr.recettes - cr.depenses).toBe(cr.resultat);
				}
			})
		);
	});

	it('l’équation de contrôle tient, Mouvements en transit compris', () => {
		fc.assert(
			fc.property(journaux, (j) => {
				for (const e of [E2025, E2026]) {
					expect(equationDeControle(j, e, P).difference).toBe(0);
				}
			})
		);
	});

	it('l’ordre du journal ne change rien', () => {
		fc.assert(
			fc.property(journaux, (j) => {
				const inverse = { ...j, operations: [...j.operations].reverse() };
				expect(compteDeResultat(inverse, E2026, P)).toEqual(compteDeResultat(j, E2026, P));
			})
		);
	});

	it('toute Ligne a exactement un Groupe', () => {
		fc.assert(
			fc.property(journaux, (j) => {
				for (const l of j.operations.flatMap((o) => o.lignes)) {
					expect(groupeDe(l, P)).toBeDefined();
				}
			})
		);
	});
});
