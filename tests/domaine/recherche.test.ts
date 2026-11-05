import { describe, expect, it } from 'vitest';
import { centimes, formaterMontant } from '#lib/domaine/montant.ts';
import {
	chercherPalette,
	montantDeTexte,
	phraseLigneTrouvee,
	rechercher,
	resumeAnalytique,
	resumeCompte
} from '#lib/domaine/recherche/index.ts';
import {
	deciderAnnulation,
	deciderModification,
	deplacerRattachements,
	exerciceFigeant,
	estSpecialisee
} from '#lib/domaine/operations/corrections.ts';
import {
	deciderLiaison,
	estSommeARendre,
	phraseLiaison,
	resteARendre,
	resumeLiaison
} from '#lib/domaine/operations/liaisons.ts';
import { recents } from '#lib/domaine/operations/recents.ts';
import { noteSuggestion, normaliser, suggerer } from '#lib/domaine/operations/suggestions.ts';
import { E2025, E2026, journal, operationJ, brouillonStandard } from './aides/journal.ts';

const c = centimes;
const ligne = (o: Record<string, unknown>) => ({
	id: 1,
	operationId: 1,
	ordre: 1,
	montant: c(-1000),
	estReduction: false,
	natureId: 1,
	actionId: null,
	exerciceRattachementId: 2,
	note: null,
	...o
});

describe('rechercher', () => {
	const autocars = operationJ({
		id: 1,
		date: '2026-10-05',
		libelle: 'Autocars du Sud',
		reference: 'FA-14',
		montant: -100000,
		lignes: [
			ligne({ montant: c(-60000), natureId: 1, actionId: 1 }),
			ligne({ id: 2, montant: c(-25000), natureId: 1, actionId: 2 }),
			ligne({ id: 3, montant: c(-15000), natureId: 2, actionId: 3, note: 'Part ferme' })
		]
	});
	const buvette = operationJ({
		id: 2,
		date: '2026-11-20',
		libelle: 'Buvette',
		montant: 25000,
		tiers: 'École fictive',
		pieces: [{ id: 1, sha256: 'a', nomOriginal: 'a.pdf', mime: 'application/pdf' }]
	});
	const j = journal({ operations: [autocars, buvette] });
	const ids = (f: Parameters<typeof rechercher>[1]) => rechercher(j, f).map((t) => t.operation.id);

	it('rend tout, le plus récent d’abord, sans critère', () => {
		expect(ids({})).toEqual([2, 1]);
	});

	it('combine dates, libellé, référence, Compte, Nature, Action et Pièce', () => {
		expect(ids({ du: '2026-11-01' })).toEqual([2]);
		expect(ids({ au: '2026-10-31' })).toEqual([1]);
		expect(ids({ texte: 'autocars' })).toEqual([1]);
		expect(ids({ texte: 'ÉCOLE' })).toEqual([2]);
		expect(ids({ texte: 'fa-14' })).toEqual([1]);
		expect(ids({ texte: 'ferme' })).toEqual([1]);
		expect(ids({ compteId: 1 })).toEqual([2, 1]);
		expect(ids({ compteId: 2 })).toEqual([]);
		expect(ids({ natureId: 2 })).toEqual([1]);
		expect(ids({ actionId: 3 })).toEqual([1]);
		expect(ids({ piece: 'avec' })).toEqual([2]);
		expect(ids({ piece: 'sans' })).toEqual([1]);
		expect(
			ids({ du: '2026-10-01', au: '2026-10-31', texte: 'auto', natureId: 1, piece: 'sans' })
		).toEqual([1]);
		expect(ids({ du: '2026-11-01', texte: 'auto' })).toEqual([]);
	});

	it('trouve un montant sur l’Opération ou dans ses Lignes', () => {
		expect(ids({ montant: c(100000) })).toEqual([1]);
		expect(ids({ montant: c(25000) })).toEqual([2, 1]);
		expect(ids({ montant: c(1) })).toEqual([]);
		const [, dansLigne] = rechercher(j, { montant: c(25000) });
		expect(dansLigne?.ligne?.montant).toBe(-25000);
	});

	it('`250` en texte cherche aussi dans les Lignes, et le dit', () => {
		const t = rechercher(j, { texte: '250' });
		expect(t.map((x) => x.operation.id)).toEqual([2, 1]);
		expect(t[0]?.ligne).toBeNull();
		expect(phraseLigneTrouvee(t[1]!)).toBe(
			`Ligne de ${formaterMontant(c(25000))} dans Autocars du Sud, ${formaterMontant(c(100000))}`
		);
		expect(phraseLigneTrouvee(t[0]!)).toBeNull();
	});

	it('montantDeTexte ne lit que des chiffres', () => {
		expect(montantDeTexte('250')).toBe(25000);
		expect(montantDeTexte('1 000,50')).toBe(100050);
		expect(montantDeTexte('FA-250')).toBeNull();
		expect(montantDeTexte('0')).toBeNull();
	});

	it('garde une Opération annulée trouvable, avec son état', () => {
		const annulee = operationJ({ id: 3, annuleeLe: '2026-10-06T08:00:00.000Z', libelle: 'Erreur' });
		const t = rechercher(journal({ operationsAnnulees: [annulee] }), {});
		expect(t[0]?.annulee).toBe(true);
	});

	it('tient 2 000 Opérations en moins de 500 ms', () => {
		const operations = Array.from({ length: 2000 }, (_, i) =>
			operationJ({
				id: i + 1,
				date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
				libelle: `Opération ${i}`,
				montant: -(i + 1) * 100,
				lignes: Array.from({ length: 3 }, (__, n) =>
					ligne({ id: n, montant: c(-(i + 1) * 33), actionId: n })
				)
			})
		);
		const debut = performance.now();
		const t = rechercher(journal({ operations }), {
			du: '2026-02-01',
			texte: 'opération 19',
			natureId: 1,
			piece: 'sans'
		});
		const duree = performance.now() - debut;
		expect(t.length).toBeGreaterThan(0);
		expect(duree).toBeLessThan(500);
	});
});

describe('résumés', () => {
	const noms = {
		comptes: [
			{ id: 1, libelle: 'CCP' },
			{ id: 2, libelle: 'Livret' }
		],
		natures: [{ id: 1, libelle: 'Transport' }],
		actions: [{ id: 1, libelle: 'Kermesse' }]
	};

	it('résume Natures et Actions', () => {
		expect(resumeAnalytique(operationJ(), noms)).toEqual({
			natures: 'Transport',
			actions: 'Sans Action'
		});
		const une = operationJ({ lignes: [ligne({ actionId: 1 })] as never });
		expect(resumeAnalytique(une, noms).actions).toBe('Kermesse');
		const trois = operationJ({
			lignes: [
				ligne({ natureId: 1, actionId: 1 }),
				ligne({ natureId: 2, actionId: 2 }),
				ligne({ natureId: 3, actionId: null })
			] as never
		});
		expect(resumeAnalytique(trois, noms)).toEqual({ natures: '3 Natures', actions: '3 Actions' });
		expect(resumeAnalytique({ genre: 'interne', lignes: [] }, noms).natures).toBe(
			'Mouvement interne'
		);
	});

	it('résume le Compte', () => {
		expect(resumeCompte(operationJ(), noms)).toBe('CCP');
		expect(resumeCompte({ genre: 'compensee', cotes: [] }, noms)).toBe('Aucun Compte');
		const interne = operationJ({
			genre: 'interne',
			cotes: [
				{ id: 1, operationId: 1, compteId: 1, date: '2026-10-05', montant: c(-100) },
				{ id: 2, operationId: 1, compteId: 2, date: '2026-10-05', montant: c(100) }
			]
		});
		expect(resumeCompte(interne, noms)).toBe('CCP vers Livret');
	});
});

describe('palette', () => {
	it('cherche Opérations et Actions actives', () => {
		const j = journal({ operations: [operationJ({ libelle: 'Kermesse buvette' })] });
		const actions = [
			{ id: 1, libelle: 'Kermesse', actif: true },
			{ id: 2, libelle: 'Kermesse 2024', actif: false }
		];
		const r = chercherPalette(j, actions, 'kerm');
		expect(r.operations).toHaveLength(1);
		expect(r.actions).toEqual([{ id: 1, libelle: 'Kermesse' }]);
		expect(chercherPalette(j, actions, '  ')).toEqual({ operations: [], actions: [] });
	});
});

describe('corrections', () => {
	const exercices = [E2025, E2026];
	const ctx = { versionLue: 1, coteIdsPointes: [], exercices };

	it('O7 : déplace les Lignes de l’ancien Exercice courant seulement', () => {
		const l = [{ exerciceRattachementId: 1 }, { exerciceRattachementId: 3 }];
		expect(deplacerRattachements(l, 1, 2).map((x) => x.exerciceRattachementId)).toEqual([2, 3]);
		expect(deplacerRattachements(l, 1, 1)).toEqual(l);
		expect(deplacerRattachements(l, undefined, 2)).toEqual(l);
	});

	it('O9 : reconnaît les origines spécialisées', () => {
		expect(estSpecialisee({ origine: 'saisie' })).toBe(false);
		expect(estSpecialisee({ origine: 'ajustement' })).toBe(false);
		expect(estSpecialisee({ origine: 'remise' })).toBe(true);
	});

	it('trouve l’Exercice clôturé par la date ou par un Côté', () => {
		expect(exerciceFigeant(operationJ({ date: '2026-03-12' }), exercices)?.id).toBe(1);
		expect(exerciceFigeant(operationJ(), exercices)).toBeUndefined();
		const aCheval = operationJ({
			cotes: [{ id: 1, operationId: 1, compteId: 1, date: '2026-08-31', montant: c(-1) }]
		});
		expect(exerciceFigeant(aCheval, exercices)?.id).toBe(1);
	});

	it('refuse un changement de genre', () => {
		const r = deciderModification(operationJ(), { ...brouillonStandard(), genre: 'interne' }, ctx);
		expect(r.ok).toBe(false);
	});

	it('garde origine et `sans_piece` de l’Opération', () => {
		const r = deciderModification(
			operationJ({ origine: 'ajustement', sansPiece: true }),
			brouillonStandard(),
			ctx
		);
		expect(r.ok && r.valeur.origine).toBe('ajustement');
		expect(r.ok && r.valeur.sansPiece).toBe(true);
	});

	it('O10 : refuse une version périmée, avant tout le reste', () => {
		const r = deciderModification(operationJ({ version: 2 }), brouillonStandard(), ctx);
		expect(!r.ok && r.erreur.code).toBe('modification_concurrente');
	});

	it('refuse de modifier une Opération annulée', () => {
		const op = operationJ({ annuleeLe: '2026-10-06T08:00:00.000Z' });
		const r = deciderModification(op, brouillonStandard(), ctx);
		expect(!r.ok && r.erreur.code).toBe('operation_annulee');
	});

	it('nomme l’Exercice clôturé qui fige l’Opération', () => {
		const r = deciderModification(operationJ({ date: '2026-03-12' }), brouillonStandard(), ctx);
		expect(!r.ok && r.erreur.details?.exercice).toBe('2025-2026');
		const a = deciderAnnulation(operationJ({ date: '2026-03-12' }), ctx);
		expect(!a.ok && a.erreur.code).toBe('exercice_cloture');
	});

	it('O9 : seule la saisie générique touche à l’analytique', () => {
		const op = operationJ({
			origine: 'remise',
			date: '2026-10-05',
			montant: -1000,
			cotes: [{ id: 1, operationId: 1, compteId: 1, date: '2026-10-05', montant: c(-1000) }]
		});
		const texte = { ...brouillonStandard(), modePaiement: null, libelle: 'Autre', note: 'Note' };
		expect(deciderModification(op, texte, ctx).ok).toBe(true);
		const r = deciderModification(op, { ...texte, date: '2026-10-06' }, ctx);
		expect(!r.ok && r.erreur.code).toBe('operation_geree_ailleurs');
		const a = deciderAnnulation(op, ctx);
		expect(!a.ok && a.erreur.code).toBe('operation_geree_ailleurs');
	});

	it('Côté pointé : montant et Compte figés, libellé libre', () => {
		const op = operationJ({
			modePaiement: 'virement',
			cotes: [{ id: 7, operationId: 1, compteId: 1, date: '2026-10-05', montant: c(-1000) }]
		});
		const pointe = { ...ctx, coteIdsPointes: [7] };
		const b = brouillonStandard();
		expect(deciderModification(op, { ...b, libelle: 'Nouveau' }, pointe).ok).toBe(true);
		const r = deciderModification(op, { ...b, cotes: [{ ...b.cotes[0]!, compteId: 2 }] }, pointe);
		expect(!r.ok && r.erreur.code).toBe('cote_pointe');
		const a = deciderAnnulation(op, pointe);
		expect(!a.ok && a.erreur.code).toBe('cote_pointe');
		expect(deciderAnnulation(op, ctx).ok).toBe(true);
	});

	it('O7 : le déplacement suit la date de l’Opération', () => {
		const ouverts = [{ ...E2025, statut: 'ouvert' as const }, E2026];
		const op = operationJ({ date: '2026-03-12', modePaiement: 'virement' });
		const b = brouillonStandard();
		const r = deciderModification(
			op,
			{ ...b, lignes: [{ ...b.lignes[0]!, exerciceRattachementId: 1 }] },
			{ ...ctx, exercices: ouverts }
		);
		expect(r.ok && r.valeur.lignes[0]?.exerciceRattachementId).toBe(2);
	});

	it('refuse d’annuler deux fois', () => {
		const op = operationJ({ annuleeLe: '2026-10-06T08:00:00.000Z' });
		expect(deciderAnnulation(op, ctx).ok).toBe(false);
	});
});

describe('liaisons', () => {
	const a = operationJ({ id: 1, montant: -22000, liaisonId: 1, date: '2026-10-01' });
	const b = operationJ({ id: 2, montant: -18050, liaisonId: 1, date: '2026-10-02' });
	const liaisons = [{ id: 1, type: 'paiement_multiple' as const, libelle: 'Spectacle' }];

	it('résume en une phrase', () => {
		const r = resumeLiaison(journal({ operations: [a, b], liaisons }), 1)!;
		expect(r.total).toBe(40050);
		expect(phraseLiaison(r)).toContain('Fait partie de : Spectacle, ');
		expect(phraseLiaison(r)).toContain('au total, 220 + 180,50');
		// Un remboursement relié vient en moins : l'addition affichée tombe juste.
		const depense = operationJ({ id: 1, date: '2026-10-01', montant: -40000, liaisonId: 1 });
		const retour = operationJ({ id: 2, date: '2026-10-02', montant: 5000, liaisonId: 1 });
		const mele = resumeLiaison(journal({ operations: [depense, retour], liaisons }), 1)!;
		expect(mele.total).toBe(35000);
		expect(mele.termes).toBe('400 − 50');
		expect(resumeLiaison(journal(), 9)).toBeNull();
	});

	it('décide nouvelle, rejoindre, fusionner', () => {
		const x = operationJ({ id: 3 });
		const y = operationJ({ id: 4 });
		expect(deciderLiaison(x, y, liaisons)).toEqual({ ok: true, valeur: { type: 'nouvelle' } });
		expect(deciderLiaison(a, y, liaisons)).toEqual({
			ok: true,
			valeur: { type: 'rejoindre', liaisonId: 1 }
		});
		const l2 = [...liaisons, { id: 2, type: 'paiement_multiple' as const, libelle: 'x' }];
		expect(deciderLiaison(a, { ...y, liaisonId: 2 }, l2)).toEqual({
			ok: true,
			valeur: { type: 'fusionner', garderId: 1, retirerId: 2 }
		});
		expect(deciderLiaison(a, b, liaisons).ok).toBe(false);
		expect(deciderLiaison(a, a, liaisons).ok).toBe(false);
		const somme = [{ id: 3, type: 'somme_a_rendre' as const, libelle: 'x' }];
		expect(deciderLiaison({ ...x, liaisonId: 3 }, y, somme).ok).toBe(false);
	});

	it('calcule ce qu’il reste à rendre', () => {
		const recue = operationJ({ id: 5, montant: 10000, liaisonId: null });
		expect(estSommeARendre(recue, 1)).toBe(true);
		expect(estSommeARendre(operationJ({ montant: -100 }), 1)).toBe(false);
		expect(resteARendre(journal(), recue)).toBe(10000);
		const liee = { ...recue, liaisonId: 2 };
		const rendue = operationJ({ id: 6, montant: -4000, liaisonId: 2 });
		expect(resteARendre(journal({ operations: [liee, rendue] }), liee)).toBe(6000);
	});
});

describe('récents', () => {
	it('classe du plus récent au plus ancien, sans doublon', () => {
		const r = recents(
			journal({
				operations: [
					operationJ({
						id: 1,
						date: '2026-10-01',
						lignes: [ligne({ natureId: 1, actionId: 1 })] as never
					}),
					operationJ({
						id: 2,
						date: '2026-10-02',
						lignes: [ligne({ natureId: 2, actionId: null })] as never
					}),
					operationJ({
						id: 3,
						date: '2026-10-03',
						lignes: [ligne({ natureId: 1, actionId: 1 })] as never
					})
				]
			})
		);
		expect(r.natures).toEqual([1, 2]);
		expect(r.actions).toEqual([1]);
		expect(r.comptes).toEqual([1]);
	});
});

describe('suggestions', () => {
	const p = {
		natures: [
			{ id: 1, actif: true, codeSysteme: null },
			{ id: 2, actif: false, codeSysteme: null },
			{ id: 3, actif: true, codeSysteme: 'ajustement' as const }
		],
		actions: [
			{ id: 1, actif: true },
			{ id: 2, actif: false }
		]
	};
	const passee = (o: Record<string, unknown> = {}) =>
		journal({
			operations: [
				operationJ({
					id: 1,
					date: '2026-03-12',
					libelle: 'Autocars du Sud',
					lignes: [ligne({ natureId: 1, actionId: 1 })] as never,
					...o
				})
			]
		});

	it('préremplit depuis un libellé proche, accents et casse ignorés', () => {
		expect(suggerer(passee(), p, 'autocar', 'depense')).toEqual({
			natureId: 1,
			actionId: 1,
			libelle: 'Autocars du Sud',
			date: '2026-03-12'
		});
		expect(suggerer(passee(), p, 'AUTOCÂR', 'depense')?.natureId).toBe(1);
		expect(suggerer(passee(), p, 'Autocars du Sud FA-12', 'depense')?.natureId).toBe(1);
	});

	it('reste muet sans libellé proche, sous 3 lettres, ou dans l’autre sens', () => {
		expect(suggerer(passee(), p, 'boulangerie', 'depense')).toBeNull();
		expect(suggerer(passee(), p, 'au', 'depense')).toBeNull();
		expect(suggerer(passee(), p, 'autocar', 'recette')).toBeNull();
	});

	it('ne suggère ni Nature ou Action inactive, ni Nature système', () => {
		const inactive = (n: number, a: number | null) =>
			passee({ lignes: [ligne({ natureId: n, actionId: a })] });
		expect(suggerer(inactive(2, 1), p, 'autocar', 'depense')).toBeNull();
		expect(suggerer(inactive(1, 2), p, 'autocar', 'depense')).toBeNull();
		expect(suggerer(inactive(3, 1), p, 'autocar', 'depense')).toBeNull();
		expect(suggerer(inactive(9, 1), p, 'autocar', 'depense')).toBeNull();
		expect(suggerer(inactive(1, 9), p, 'autocar', 'depense')).toBeNull();
		expect(suggerer(inactive(1, null), p, 'autocar', 'depense')?.actionId).toBeNull();
	});

	it('rédige la note', () => {
		expect(noteSuggestion({ libelle: 'Autocars du Sud', date: '2026-03-12' })).toBe(
			'Comme “Autocars du Sud” en mars'
		);
		expect(normaliser(' École ')).toBe('ecole');
	});
});
