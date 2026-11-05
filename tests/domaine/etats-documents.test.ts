import { describe, expect, it } from 'vitest';
import {
	aplatir,
	basculer,
	lireOuvertes,
	noeudGroupe,
	noeudNature
} from '#lib/domaine/etats/arbre.ts';
import {
	cheminPiece,
	csvLignes,
	csvOperations,
	csvPointages,
	lisezMoi
} from '#lib/domaine/etats/export-complet.ts';
import { deciderCloture, figerParametrage, serialiserCloture } from '#lib/domaine/etats/cloture.ts';
import { cartesComptes } from '#lib/domaine/etats/controle.ts';
import {
	modeleAction,
	modeleActions,
	modeleCompteDeResultat,
	modeleDocumentAg,
	modeleTresorerie
} from '#lib/domaine/etats/documents.ts';
import {
	compteDeResultat,
	detailAction,
	resultatParAction,
	type ParametrageEtats
} from '#lib/domaine/etats/resultat.ts';
import { etatTresorerie } from '#lib/domaine/etats/tresorerie.ts';
import { verifierJournal } from '#lib/domaine/etats/verification.ts';
import type { GrandJournal, OperationJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { E2025, E2026, journal, operationJ, REPERE } from './aides/journal.ts';

const c = centimes;
const P: ParametrageEtats = {
	groupes: [{ id: 1, libelle: 'Évènements', ordre: 1 }],
	natures: [
		{ id: 1, libelle: 'Transport', groupeId: 1, neutre: false },
		{ id: 2, libelle: 'Rendre', groupeId: 1, neutre: true }
	],
	actions: [{ id: 1, libelle: 'Kermesse', groupeId: 1 }],
	comptes: [
		{ id: 1, libelle: 'CCP', type: 'banque', ordre: 1, actif: true },
		{ id: 2, libelle: 'Livret', type: 'epargne', ordre: 2, actif: true }
	]
};

function avec(op: OperationJ, partiel: Partial<OperationJ['lignes'][number]>): OperationJ {
	return { ...op, lignes: op.lignes.map((l) => ({ ...l, ...partiel })) };
}

function jeu(): GrandJournal {
	return journal({
		operations: [
			avec(operationJ({ id: 1, montant: -100_00 }), { actionId: 1 }),
			avec(operationJ({ id: 2, montant: -40_00 }), { actionId: null }),
			avec(operationJ({ id: 3, montant: -5_00 }), { exerciceRattachementId: E2025.id })
		]
	});
}

describe('rangées dépliables', () => {
	const cr = compteDeResultat(jeu(), E2026, P);
	const noeuds = cr.groupes.map(noeudGroupe);

	it('ne rend que ce qui est déplié', () => {
		expect(aplatir(noeuds, new Set()).map((r) => r.cle)).toEqual(['g1']);
		const ouvert = aplatir(noeuds, new Set(['g1', 'a1', 'a1-n1']));
		expect(ouvert.map((r) => [r.type, r.niveau])).toEqual([
			['groupe', 1],
			['action', 2],
			['nature', 3],
			['ligne', 4],
			['nature', 2]
		]);
		expect(ouvert[0]).toMatchObject({ depliable: true, deplie: true, rang: 1, freres: 1 });
		expect(ouvert[3]).toMatchObject({ depliable: false, resultat: -100_00, depenses: 100_00 });
		expect(ouvert[3]?.ligne?.operationId).toBe(1);
		expect(ouvert[1]?.actionId).toBe(1);
	});

	it('lit et bascule `?ouvert=`, sans garder un enfant replié', () => {
		expect([...lireOuvertes('g1,a3,a3-n5,<x>')]).toEqual(['g1', 'a3', 'a3-n5']);
		expect(lireOuvertes(null).size).toBe(0);
		expect(basculer(new Set(['g1']), 'a3')).toBe('g1,a3');
		expect(basculer(new Set(['g1', 'a3', 'a3-n5']), 'a3')).toBe('g1');
	});

	it('nomme une Nature à part, pour le bloc Sans Action', () => {
		const r = resultatParAction(jeu(), E2026, P);
		expect(noeudNature(r.sansAction[0]!, 's').cle).toBe('s-n1');
	});
});

const champ = (cellules: unknown[]) =>
	cellules.map((x) =>
		typeof x === 'object' && x !== null ? (x as { montant: number }).montant : x
	);

describe('modèles de document', () => {
	const j = jeu();
	const cr = compteDeResultat(j, E2026, P);
	const t = etatTresorerie(j, E2026, P);

	it('Compte de résultat : Groupes, puis total, bloc antérieur séparé', () => {
		const m = modeleCompteDeResultat(cr, E2026, 'APE fictive');
		expect(m.provisoire).toBe(true);
		expect(m.nomFichier).toBe('compte-de-resultat-2026-2027');
		const lignes = m.sections[0]?.tableau?.rangees ?? [];
		expect(lignes[0]?.cellules[0]).toBe('Évènements');
		expect(champ(lignes.at(-1)?.cellules ?? [])).toEqual([
			'Résultat de l’Exercice',
			0,
			140_00,
			-140_00
		]);
		expect(m.sections[1]?.titre).toBe('Sur Exercices antérieurs');
	});

	it('Trésorerie : Comptes, restes dus et explication ligne par ligne', () => {
		const m = modeleTresorerie(t, E2026, 'APE fictive');
		expect(m.sections.map((s) => s.titre)).toEqual([
			'État de trésorerie',
			'Créances et Dettes',
			'Explication résultat et variation'
		]);
		expect(m.sections[2]?.tableau?.rangees.at(-1)?.total).toBe(true);
	});

	it('Actions : les Lignes sans Action à part, et une Action seule', () => {
		const r = resultatParAction(j, E2026, P);
		const m = modeleActions(r, { ...E2026, statut: 'cloture' }, 'APE fictive');
		expect(m.provisoire).toBe(false);
		const libelles = m.sections[0]?.tableau?.rangees.map((x) => x.cellules[0]);
		expect(libelles).toContain('Sans Action');
		const a = modeleAction(detailAction(r, 1)!, E2026, 'APE fictive');
		expect(a.sections[0]?.tableau?.rangees.at(-1)?.cellules[0]).toBe('Résultat de l’Action');
		expect(a.nomFichier).toBe('action-1-2026-2027');
		expect(modeleActions(resultatParAction(journal(), E2026, P), E2026, 'x').sections).toHaveLength(
			1
		);
	});

	it('Document d’AG : réunit les états, liste les Écarts restants', () => {
		const sans = modeleDocumentAg({
			exercice: E2026,
			association: 'APE fictive',
			resultat: cr,
			tresorerie: t,
			cartes: []
		});
		expect(sans.sections.map((s) => s.titre)).toEqual([
			'Compte de résultat',
			'Sur Exercices antérieurs',
			'État de trésorerie',
			'Créances et Dettes',
			'Explication résultat et variation',
			'Écarts restants'
		]);
		expect(sans.sections.at(-1)?.phrases[0]).toContain('Aucun Écart');
		const avecEcart = journal({
			...j,
			constats: [
				{
					id: 1,
					compteId: 1,
					date: '2026-11-01',
					solde: c(1_00),
					source: 'releve',
					creeLe: '2026-11-02T10:00:00.000Z'
				}
			]
		});
		const m = modeleDocumentAg({
			exercice: E2026,
			association: 'APE fictive',
			resultat: cr,
			tresorerie: t,
			cartes: cartesComptes(avecEcart, E2026, '2026-11-04')
		});
		expect(m.sections.at(-1)?.tableau?.rangees).toHaveLength(1);
	});

	it('n’emploie aucun terme interdit', () => {
		const m = modeleDocumentAg({
			exercice: E2026,
			association: 'APE fictive',
			resultat: cr,
			tresorerie: t,
			cartes: []
		});
		expect(JSON.stringify(m)).not.toMatch(/débit|crédit|écriture|contrepartie/i);
	});
});

describe('export complet', () => {
	it('nettoie le chemin d’une Pièce', () => {
		expect(cheminPiece({ id: 12, nomOriginal: '../ticket été (2).pdf' })).toBe(
			'pieces/0012-ticket-ete-2-.pdf'
		);
		expect(cheminPiece({ id: 1, nomOriginal: '...' })).toBe('pieces/0001-piece');
	});

	it('liste les Opérations, annulées comprises, avec le fichier de leurs Pièces', () => {
		const op = {
			...operationJ({ id: 1, montant: -10_00 }),
			pieces: [{ id: 3, sha256: 'a', nomOriginal: 'ticket.pdf', mime: 'application/pdf' }]
		};
		const interne: OperationJ = {
			...operationJ({ id: 2, montant: 0 }),
			genre: 'interne',
			lignes: [],
			cotes: [
				{ id: 21, operationId: 2, compteId: 1, date: '2026-10-05', montant: c(-5_00) },
				{ id: 22, operationId: 2, compteId: 2, date: '2026-10-05', montant: c(5_00) }
			]
		};
		const annulee = {
			...operationJ({ id: 3, montant: 1_00 }),
			annuleeLe: '2026-10-06T10:00:00.000Z'
		};
		const compensee = { ...operationJ({ id: 4 }), genre: 'compensee' as const };
		const t = csvOperations(
			{ operations: [op, interne, compensee], operationsAnnulees: [annulee] },
			P
		);
		expect(t.lignes.map((l) => l[2])).toEqual([
			'Dépense',
			'Mouvement interne',
			'Recette',
			'Opération compensée'
		]);
		expect(t.lignes[0]?.at(-1)).toBe('pieces/0003-ticket.pdf');
		expect(t.lignes[1]?.[4]).toBe('5,00');
		expect(t.lignes[2]?.[10]).toBe('Annulée');
	});

	it('dit à quel résultat compte chaque Ligne', () => {
		const t = csvLignes(jeu(), P);
		const dernier = t.entetes.length - 1;
		expect(t.lignes.map((l) => l[dernier])).toEqual(['2026-2027', '2026-2027', '']);
		expect(t.lignes[0]?.[6]).toBe('Kermesse');
		expect(t.lignes[0]?.[7]).toBe('Évènements');
	});

	it('relie Opérations et Lignes de relevé d’un Pointage', () => {
		const op = operationJ({ id: 1, montant: -10_00 });
		const t = csvPointages(
			{
				operations: [op],
				lignesReleve: [
					{
						id: 7,
						compteId: 1,
						date: '2026-10-05',
						montant: c(-10_00),
						libelle: 'Papeterie',
						doublon: 'non',
						importId: 1,
						identifiantSource: null,
						empreinte: 'e',
						creeLe: '2026-11-01T10:00:00.000Z'
					}
				],
				pointages: [
					{
						id: 1,
						compteId: 1,
						coteIds: [op.cotes[0]!.id],
						ligneReleveIds: [7],
						creeLe: '2026-11-01T10:00:00.000Z'
					}
				]
			},
			P
		);
		expect(t.lignes.map((l) => l[2])).toEqual(['Opération', 'Ligne de relevé']);
	});

	it('explique l’archive sans vocabulaire comptable', () => {
		const texte = lisezMoi('APE fictive', '4 novembre 2026', [E2026, REPERE]);
		expect(texte).toContain('Exercices tenus : 2026-2027.');
		expect(lisezMoi('APE', 'x', [])).toContain('aucun');
		expect(texte).not.toMatch(/débit|crédit|écriture|contrepartie/i);
	});
});

describe('clôture', () => {
	const ouverts = [{ ...E2025, statut: 'ouvert' as const }, E2026];

	it('E3 : refuse un Exercice plus récent que le plus ancien ouvert', () => {
		const r = deciderCloture(ouverts, E2026.id, []);
		expect(r).toEqual({ ok: false, erreur: { code: 'cloture_ordre' } });
		expect(deciderCloture(ouverts, E2025.id, []).ok).toBe(true);
	});

	it('E4 : refuse une Session ouverte datée dans l’Exercice, pas ailleurs', () => {
		const dans = [{ caisse: 'Caisse 2', date: '2026-06-20' }];
		expect(deciderCloture(ouverts, E2025.id, dans)).toEqual({
			ok: false,
			erreur: { code: 'session_a_cloturer', details: { caisse: 'Caisse 2' } }
		});
		const apres = [{ caisse: 'Caisse 2', date: '2026-10-20' }];
		expect(deciderCloture(ouverts, E2025.id, apres).ok).toBe(true);
	});

	it('E5 : refuse un Exercice déjà clôturé, un repère, un inconnu', () => {
		expect(deciderCloture([E2025, E2026], E2025.id, [])).toEqual({
			ok: false,
			erreur: { code: 'exercice_cloture', details: { exercice: '2025-2026' } }
		});
		expect(deciderCloture([REPERE, E2026], REPERE.id, []).ok).toBe(false);
		expect(deciderCloture([E2026], 99, []).ok).toBe(false);
	});

	it('fige les entrées du calcul, avec les Comptes présentés', () => {
		const f = figerParametrage(P, [1]);
		expect(f.comptes.map((x) => x.libelle)).toEqual(['CCP']);
		expect(f.groupes).toEqual(P.groupes);
		expect(JSON.parse(JSON.stringify(f))).toEqual(f);
	});

	it('produit une sérialisation stable, sensible aux seules entrées figées', () => {
		const j = jeu();
		const texte = serialiserCloture(j, E2026, P);
		const inverse = { ...j, operations: [...j.operations].reverse() };
		expect(serialiserCloture(inverse, E2026, P)).toBe(texte);

		const permis = {
			...j,
			operations: j.operations.map((o) => ({
				...o,
				sansPiece: true,
				liaisonId: 9,
				version: 7,
				pieces: [{ id: 1, sha256: 'a', nomOriginal: 'x', mime: 'y' }]
			}))
		};
		expect(serialiserCloture(permis, E2026, P)).toBe(texte);

		const op = j.operations[0]!;
		const altere = {
			...j,
			operations: [{ ...op, libelle: 'Autre' }, ...j.operations.slice(1)]
		};
		expect(serialiserCloture(altere, E2026, P)).not.toBe(texte);
	});
});

describe('vérification', () => {
	const p = () => P;
	const codes = (j: GrandJournal) => verifierJournal(j, p).map((v) => v.invariant);

	it('ne dit rien d’un journal juste', () => {
		expect(codes(journal({ ancres: [], operations: [operationJ({})] }))).toEqual([]);
	});

	it('O1 à O6 : formes, équilibre, dates, rattachements', () => {
		const juste = operationJ({ id: 1, montant: -10_00 });
		const desequilibre = { ...juste, lignes: [{ ...juste.lignes[0]!, montant: c(-9_00) }] };
		expect(codes(journal({ ancres: [], operations: [desequilibre] }))).toContain('O1');

		expect(codes(journal({ ancres: [], operations: [{ ...juste, cotes: [] }] }))).toContain('O2');
		const dateAutre = { ...juste, cotes: [{ ...juste.cotes[0]!, date: '2026-10-06' }] };
		expect(codes(journal({ ancres: [], operations: [dateAutre] }))).toContain('O2');

		const interne = { ...juste, genre: 'interne' as const, lignes: [] };
		expect(codes(journal({ ancres: [], operations: [interne] }))).toContain('O3');
		const sortant: OperationJ = {
			...interne,
			cotes: [
				{ ...juste.cotes[0]!, compteId: 1, date: '2026-10-06', montant: c(-5_00) },
				{ ...juste.cotes[0]!, id: 99, compteId: 2, date: '2026-10-05', montant: c(5_00) }
			]
		};
		expect(codes(journal({ ancres: [], operations: [sortant] }))).toContain('O3');

		const compensee = { ...juste, genre: 'compensee' as const };
		expect(codes(journal({ ancres: [], operations: [compensee] }))).toContain('O4');

		const horsExercice = operationJ({ date: '2030-01-01' });
		expect(codes(journal({ ancres: [], operations: [horsExercice] }))).toContain('O5');
		const avantAncre = operationJ({ date: '2026-01-05' });
		expect(codes(journal({ operations: [avantAncre] }))).toContain('O5');

		const rattachee = avec(operationJ({ date: '2025-10-05' }), {
			exerciceRattachementId: E2026.id
		});
		expect(codes(journal({ ancres: [], operations: [rattachee] }))).toContain('O6');
	});

	it('nomme l’Exercice touché par une équation fausse', () => {
		const juste = operationJ({ id: 1, montant: -10_00 });
		const v = verifierJournal(
			journal({
				ancres: [],
				operations: [{ ...juste, lignes: [{ ...juste.lignes[0]!, montant: c(-9_00) }] }]
			}),
			p
		);
		expect(v.find((x) => x.invariant === 'Équation de contrôle')?.exercice).toBe('2026-2027');
	});

	it('P1 à P4, O8, P6 : Pointages et relevés', () => {
		const op = operationJ({ id: 1, montant: -10_00 });
		const ligne = {
			id: 1,
			compteId: 1,
			date: '2026-10-05',
			montant: c(-10_00),
			libelle: 'x',
			doublon: 'non' as const,
			importId: 1,
			identifiantSource: null,
			empreinte: 'e',
			creeLe: '2026-11-01T10:00:00.000Z'
		};
		const pointage = {
			id: 1,
			compteId: 1,
			coteIds: [op.cotes[0]!.id],
			ligneReleveIds: [1],
			creeLe: '2026-11-01T10:00:00.000Z'
		};
		const base = { ancres: [], operations: [op], lignesReleve: [ligne], pointages: [pointage] };
		expect(codes(journal(base))).toEqual([]);
		expect(codes(journal({ ...base, lignesReleve: [{ ...ligne, compteId: 2 }] }))).toContain('P1');
		expect(codes(journal({ ...base, lignesReleve: [{ ...ligne, montant: c(-1) }] }))).toContain(
			'P2'
		);
		expect(
			codes(
				journal({
					...base,
					pointages: [{ ...pointage, ligneReleveIds: [], creeLe: '2026-11-01T10:00:00.000Z' }]
				})
			)
		).toContain('P3');
		expect(
			codes(journal({ ...base, lignesReleve: [{ ...ligne, doublon: 'a_confirmer' }] }))
		).toContain('P4');
		expect(codes(journal({ ...base, operations: [], operationsAnnulees: [op] }))).toContain('O8');
		expect(codes(journal({ lignesReleve: [{ ...ligne, date: '2026-01-01' }] }))).toContain('P6');
	});

	it('E1 à E3, E6 : suite des Exercices et ancres', () => {
		const ouvert = {
			...E2026,
			id: 8,
			libelle: '2027-2028',
			anneeDebut: 2027,
			debut: '2027-09-01',
			fin: '2028-08-31'
		};
		const troisieme = {
			...ouvert,
			id: 9,
			libelle: '2028-2029',
			anneeDebut: 2028,
			debut: '2028-09-01',
			fin: '2029-08-31'
		};
		expect(
			codes(
				journal({
					ancres: [],
					exercices: [{ ...E2025, statut: 'ouvert' }, E2026, ouvert, troisieme]
				})
			)
		).toContain('E1');
		expect(codes(journal({ ancres: [], exercices: [E2025, troisieme] }))).toContain('E1');
		expect(
			codes(
				journal({
					ancres: [],
					exercices: [
						{ ...E2025, statut: 'ouvert' },
						{ ...E2026, statut: 'cloture' }
					]
				})
			)
		).toContain('E3');
		expect(
			codes(journal({ ancres: [], exercices: [{ ...REPERE, anneeDebut: 2030 }, E2026] }))
		).toContain('E2');
		expect(
			codes(journal({ ancres: [{ compteId: 1, exerciceId: REPERE.id, solde: c(0) }] }))
		).toContain('E6');
	});

	it('F1 : les règlements ne dépassent pas la somme', () => {
		const op = operationJ({ id: 1 });
		const somme = {
			id: 1,
			sens: 'dette' as const,
			tiers: 'x',
			motif: 'y',
			montant: c(5_00),
			date: '2026-10-01',
			actionId: null,
			note: null,
			annuleeLe: null,
			reglements: [{ operationId: 1, montant: c(6_00) }]
		};
		expect(codes(journal({ ancres: [], operations: [op], creancesDettes: [somme] }))).toContain(
			'F1'
		);
	});
});
