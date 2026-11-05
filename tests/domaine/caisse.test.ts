import { describe, expect, it } from 'vitest';
import {
	AUTRES_COUPURES,
	BILLETS,
	comparerAuSoldeAttendu,
	controlerDateComptage,
	coupuresSaisies,
	deciderReouverture,
	dernierComptageSession,
	fondDeCaisse,
	mouvementsDepuisRepere,
	phaseDuCote,
	PIECES,
	prefillOuverture,
	repereCaisse,
	sessionOuverteLe,
	soldeCourantCaisse,
	termesRecette,
	totalComptage
} from '#lib/domaine/caisse/index.ts';
import { ecart, ecartExplique, ecartNonExplique } from '#lib/domaine/etats/ecart.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type {
	ComptageJ,
	CoupureJ,
	GrandJournal,
	OperationJ,
	PhaseSession,
	SessionJ
} from '#lib/domaine/journal.ts';
import { centimes as c, formaterMontant } from '#lib/domaine/montant.ts';
import { CCP, E2025, E2026, journal, operationJ } from './aides/journal.ts';

const CAISSE = { ...CCP, id: 5, libelle: 'Caisse 2', type: 'caisse' as const };
const RESERVE = { ...CAISSE, id: 6, libelle: 'Réserve', reserve: true };
const JOUR = '2026-10-10';

/** Le détail des coupures n'importe pas ici : tout en pièces de 1 centime. */
const de = (montant: number): CoupureJ[] => [{ coupure: c(1), quantite: montant }];

function comptage(partiel: Partial<ComptageJ> & { id: number; montant: number }): ComptageJ {
	const { montant, ...reste } = partiel;
	return {
		compteId: CAISSE.id,
		sessionCaisseId: null,
		type: 'controle',
		date: JOUR,
		compteLe: `${JOUR}T10:00:00.000Z`,
		saisiLe: `${JOUR}T10:00:00.000Z`,
		saisiPar: 1,
		operationEcartId: null,
		coupures: de(montant),
		...reste
	};
}

function session(partiel: Partial<SessionJ> = {}): SessionJ {
	return {
		id: 1,
		compteId: CAISSE.id,
		actionId: 7,
		ouverteLe: `${JOUR}T09:00:00.000Z`,
		ouvertePar: 1,
		clotureeLe: null,
		clotureePar: null,
		operationRecetteId: null,
		...partiel
	};
}

const ouverture = (montant = 150_00, date = JOUR) =>
	comptage({
		id: 1,
		montant,
		date,
		type: 'ouverture',
		sessionCaisseId: 1,
		compteLe: `${date}T09:00:00.000Z`
	});
const fin = (montant = 412_50, date = JOUR) =>
	comptage({
		id: 2,
		montant,
		date,
		type: 'fin',
		sessionCaisseId: 1,
		compteLe: `${date}T17:00:00.000Z`
	});

function mouvement(
	montant: number,
	phase: PhaseSession | null,
	o: { id: number; date?: string; genre?: OperationJ['genre']; creeLe?: string; autre?: boolean }
): OperationJ {
	const date = o.date ?? JOUR;
	const op = operationJ({ id: o.id, date, montant, genre: o.genre ?? 'standard' });
	return {
		...op,
		creeLe: o.creeLe ?? `${date}T20:00:00.000Z`,
		lignes: o.genre === 'interne' ? [] : op.lignes,
		cotes: [
			{
				id: o.id * 10,
				operationId: o.id,
				compteId: CAISSE.id,
				date,
				montant: c(montant),
				sessionCaisseId: phase === null ? null : 1,
				sessionPhase: phase
			}
		]
	};
}

function caisse(partiel: Partial<GrandJournal> = {}): GrandJournal {
	return journal({
		comptes: [CCP, CAISSE, RESERVE],
		ancres: [{ compteId: CAISSE.id, exerciceId: E2026.id, solde: c(150_00) }],
		...partiel
	});
}

describe('Comptage (AD-10)', () => {
	it('propose les coupures de l’euro, 500 et 200 € à part', () => {
		expect(BILLETS).toEqual([10000, 5000, 2000, 1000, 500]);
		expect(PIECES).toEqual([200, 100, 50, 20, 10, 5, 2, 1]);
		expect(AUTRES_COUPURES).toEqual([50000, 20000]);
	});

	it('calcule le total depuis ses coupures, au centime', () => {
		expect(
			totalComptage([
				{ coupure: c(2000), quantite: 3 },
				{ coupure: c(10), quantite: 7 },
				{ coupure: c(1), quantite: 3 }
			])
		).toBe(60_73);
		expect(totalComptage([])).toBe(0);
	});

	it('ne garde que les coupures comptées, dans l’ordre', () => {
		const q = new Map([
			[c(1), 2],
			[c(2000), 3],
			[c(500), 0]
		]);
		expect(coupuresSaisies(q)).toEqual([
			{ coupure: 2000, quantite: 3 },
			{ coupure: 1, quantite: 2 }
		]);
	});
});

describe('Recette d’espèces (C5, FR-20)', () => {
	const journalKermesse = () =>
		caisse({
			sessions: [session()],
			comptages: [ouverture(), fin()],
			operations: [
				mouvement(-35_00, 'pendant', { id: 1 }),
				mouvement(-100_00, 'pendant', { id: 2, genre: 'interne' })
			]
		});

	it('Comptage final 412,50, Fond 150, dépenses 35, sortants 100, entrants 0 : 397,50', () => {
		expect(termesRecette(journalKermesse(), 1)).toEqual({
			comptageFinal: 412_50,
			fond: 150_00,
			depenses: 35_00,
			transfertsSortants: 100_00,
			transfertsEntrants: 0,
			recette: 397_50
		});
	});

	it('ne compte que la phase pendant', () => {
		const j = journalKermesse();
		j.operations.push(mouvement(-50_00, 'apres_comptage', { id: 3, genre: 'interne' }));
		expect(termesRecette(j, 1)?.recette).toBe(397_50);
	});

	it('une entrée vient en moins, un transfert entrant aussi', () => {
		const j = journalKermesse();
		j.operations.push(mouvement(5_00, 'pendant', { id: 3 }));
		j.operations.push(mouvement(20_00, 'pendant', { id: 4, genre: 'interne' }));
		expect(termesRecette(j, 1)).toMatchObject({
			depenses: 30_00,
			transfertsEntrants: 20_00,
			recette: 372_50
		});
	});

	it('n’existe pas avant le Comptage final', () => {
		const j = caisse({ sessions: [session()], comptages: [ouverture()] });
		expect(termesRecette(j, 1)).toBeNull();
		expect(fondDeCaisse(j, 1)).toBe(150_00);
		expect(dernierComptageSession(j, 1)?.type).toBe('ouverture');
	});
});

describe('soldeCourantCaisse et soldeCompte (§8, AD-10)', () => {
	it('part du dernier Comptage et ajoute les mouvements suivants', () => {
		const j = caisse({
			comptages: [comptage({ id: 1, montant: 80_00, date: '2026-10-01' })],
			operations: [
				mouvement(-5_00, null, { id: 1, date: '2026-09-20' }),
				mouvement(-10_00, null, { id: 2, date: '2026-10-05' })
			]
		});
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(70_00);
		expect(mouvementsDepuisRepere(j, CAISSE.id, { jour: JOUR }).mouvements).toHaveLength(1);
	});

	it('sans repère, il part de l’ancre, comme soldeCompte', () => {
		const j = caisse({ operations: [mouvement(-5_00, null, { id: 1 })] });
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(145_00);
		expect(soldeCompte(j, CAISSE.id, JOUR)).toBe(145_00);
	});

	it('une Session d’un seul jour, transfert après le Comptage final compris', () => {
		const ouverteJ = caisse({
			sessions: [session()],
			comptages: [ouverture()],
			operations: [mouvement(-35_00, 'pendant', { id: 1 })]
		});
		// Le soldeCompte ignore tout de la recette : pendant la Session, seul le premier est juste.
		expect(soldeCourantCaisse(ouverteJ, CAISSE.id, { jour: JOUR })).toBe(115_00);

		const j = caisse({
			sessions: [session()],
			comptages: [ouverture(), fin()],
			operations: [
				mouvement(-35_00, 'pendant', { id: 1 }),
				mouvement(-100_00, 'pendant', { id: 2, genre: 'interne' }),
				mouvement(-60_00, 'apres_comptage', { id: 3, genre: 'interne' })
			]
		});
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(352_50);
		expect(soldeCompte(j, CAISSE.id, JOUR)).toBe(-45_00);
		expect(termesRecette(j, 1)?.recette).toBe(397_50);

		const recette = mouvement(397_50, null, { id: 4, creeLe: `${JOUR}T21:00:00.000Z` });
		const close = {
			...j,
			sessions: [session({ clotureeLe: `${JOUR}T21:00:00.000Z`, operationRecetteId: 4 })],
			operations: [...j.operations, recette]
		};
		expect(soldeCourantCaisse(close, CAISSE.id, { jour: JOUR })).toBe(352_50);
		expect(soldeCompte(close, CAISSE.id, JOUR)).toBe(352_50);
	});

	it('un Écart de caisse issu du Comptage y est déjà compté', () => {
		const ecartOp = mouvement(-40, null, { id: 1, creeLe: `${JOUR}T09:00:00.000Z` });
		const j = caisse({
			sessions: [session()],
			comptages: [{ ...ouverture(149_60), operationEcartId: 1 }],
			operations: [ecartOp]
		});
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(149_60);
		expect(soldeCompte(j, CAISSE.id, JOUR)).toBe(149_60);
	});

	it('même jour sans Session : l’heure d’enregistrement tranche, pour un Comptage', () => {
		const j = caisse({
			comptages: [comptage({ id: 1, montant: 80_00 })],
			operations: [
				mouvement(-5_00, null, { id: 1, creeLe: `${JOUR}T08:00:00.000Z` }),
				mouvement(-10_00, null, { id: 2, creeLe: `${JOUR}T11:00:00.000Z` })
			]
		});
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(70_00);
	});

	it('le dernier constat du jalon 1 fournit le repère, sans reprise (AD-22)', () => {
		const j = caisse({
			constats: [
				{
					id: 1,
					compteId: CAISSE.id,
					date: '2026-10-01',
					solde: c(120_00),
					source: 'saisie',
					creeLe: '2026-10-01T18:00:00.000Z'
				}
			],
			operations: [mouvement(-5_00, null, { id: 1, date: '2026-10-02' })]
		});
		expect(repereCaisse(j, CAISSE.id, { jour: JOUR })?.source).toBe('constat');
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(115_00);
		expect(prefillOuverture(j, CAISSE.id, JOUR)).toEqual({ type: 'sans_repere' });
	});

	it('un Comptage prime sur un constat du même jour', () => {
		const j = caisse({
			constats: [
				{
					id: 1,
					compteId: CAISSE.id,
					date: JOUR,
					solde: c(1_00),
					source: 'saisie',
					creeLe: `${JOUR}T18:00:00.000Z`
				}
			],
			comptages: [comptage({ id: 1, montant: 80_00 })]
		});
		expect(soldeCourantCaisse(j, CAISSE.id, { jour: JOUR })).toBe(80_00);
	});

	it('rejoue un instant passé, sans le Comptage corrigé ni ce qui l’a suivi', () => {
		const j = caisse({
			sessions: [session()],
			comptages: [
				comptage({ id: 9, montant: 150_00, date: '2026-10-01' }),
				{ ...ouverture(149_60), id: 1 }
			],
			operations: [mouvement(-35_00, 'pendant', { id: 1 })]
		});
		expect(
			soldeCourantCaisse(j, CAISSE.id, {
				jour: JOUR,
				jusqua: `${JOUR}T09:00:00.000Z`,
				sauf: 1
			})
		).toBe(150_00);
	});
});

describe('Ouverture préremplie (FR-17)', () => {
	const coupures = [{ coupure: c(5000), quantite: 3 }];

	it('reprend les coupures si rien n’a bougé', () => {
		const j = caisse({
			comptages: [{ ...comptage({ id: 1, montant: 0 }), coupures }]
		});
		expect(prefillOuverture(j, CAISSE.id, JOUR)).toEqual({ type: 'repris', coupures });
	});

	it('reste vide si la caisse a bougé depuis', () => {
		const j = caisse({
			comptages: [{ ...comptage({ id: 1, montant: 0 }), coupures }],
			operations: [mouvement(-5_00, null, { id: 1 })]
		});
		expect(prefillOuverture(j, CAISSE.id, JOUR)).toEqual({ type: 'a_compter' });
	});

	it('une recette née du dernier Comptage n’est pas un mouvement', () => {
		const j = caisse({
			sessions: [session({ clotureeLe: `${JOUR}T21:00:00.000Z`, operationRecetteId: 1 })],
			comptages: [ouverture(), { ...fin(), coupures }],
			operations: [mouvement(262_50, null, { id: 1 })]
		});
		expect(prefillOuverture(j, CAISSE.id, JOUR)).toEqual({ type: 'repris', coupures });
	});
});

describe('Recomptage (C9)', () => {
	it('un Comptage égal au solde attendu passe sans confirmation', () => {
		expect(comparerAuSoldeAttendu(c(150_00), c(150_00), null)).toEqual({
			ok: true,
			valeur: { ecart: 0 }
		});
	});

	it('une différence demande un second envoi, sans rien écrire', () => {
		expect(comparerAuSoldeAttendu(c(149_60), c(150_00), null)).toEqual({
			ok: false,
			erreur: {
				code: 'recomptage_requis',
				details: { montant: formaterMontant(c(40)), sens: 'de moins', total: 149_60 }
			}
		});
	});

	it('le même total confirme, un autre redemande', () => {
		expect(comparerAuSoldeAttendu(c(149_60), c(150_00), c(149_60))).toEqual({
			ok: true,
			valeur: { ecart: -40 }
		});
		const r = comparerAuSoldeAttendu(c(151_00), c(150_00), c(149_60));
		expect(r).toMatchObject({ ok: false, erreur: { details: { sens: 'de plus' } } });
	});
});

describe('Phase d’un Côté (C12, AD-10)', () => {
	it('sans Comptage final : pendant', () => {
		expect(phaseDuCote(JOUR, null, 'apres_comptage', 'apres_comptage')).toBe('pendant');
	});

	it('une date différente tranche seule', () => {
		expect(phaseDuCote('2026-10-09', JOUR, 'apres_comptage', 'apres_comptage')).toBe('pendant');
		expect(phaseDuCote('2026-10-11', JOUR, 'pendant', 'pendant')).toBe('apres_comptage');
	});

	it('le même jour, la réponse compte, sinon le défaut', () => {
		expect(phaseDuCote(JOUR, JOUR, 'pendant', 'apres_comptage')).toBe('pendant');
		expect(phaseDuCote(JOUR, JOUR, undefined, 'apres_comptage')).toBe('apres_comptage');
	});
});

describe('Réouverture (C7)', () => {
	const close = { clotureeLe: `${JOUR}T21:00:00.000Z`, clotureePar: 1 };

	it('la dernière Session d’un Exercice ouvert se rouvre', () => {
		const j = caisse({ sessions: [session(close)], comptages: [ouverture(), fin()] });
		expect(deciderReouverture(j, 1)).toMatchObject({ ok: true });
	});

	it('refuse une Session plus ancienne, encore ouverte, ou d’un Exercice clôturé', () => {
		const refus = { ok: false, erreur: { code: 'session_invalide' } };
		const deux = caisse({
			sessions: [session(close), session({ id: 2 })],
			comptages: [ouverture(), fin()]
		});
		expect(deciderReouverture(deux, 1)).toMatchObject(refus);
		expect(deciderReouverture(deux, 2)).toMatchObject(refus);
		const clos = caisse({
			sessions: [session(close)],
			comptages: [ouverture(150_00, '2026-08-20'), fin(200_00, '2026-08-20')]
		});
		expect(clos.exercices.find((e) => e.id === E2025.id)?.statut).toBe('cloture');
		expect(deciderReouverture(clos, 1)).toMatchObject(refus);
		expect(deciderReouverture(deux, 99)).toMatchObject({
			ok: false,
			erreur: { code: 'element_introuvable' }
		});
	});
});

describe('Date d’un Comptage (FR-17)', () => {
	const ctx = {
		aujourdhui: JOUR,
		exercices: [E2025, E2026],
		auPlusTot: '2026-10-05',
		debutAncre: E2026.debut
	};

	it('accepte le jour même et un Comptage oublié', () => {
		expect(controlerDateComptage(JOUR, ctx).ok).toBe(true);
		expect(controlerDateComptage('2026-10-06', ctx).ok).toBe(true);
	});

	it('refuse demain, l’avant-dernier Comptage et un Exercice clôturé', () => {
		const code = (
			d: string,
			c2:
				| typeof ctx
				| {
						auPlusTot: null;
						aujourdhui: string;
						exercices: typeof ctx.exercices;
						debutAncre: string | null;
				  } = ctx
		) => {
			const r = controlerDateComptage(d, c2);
			return r.ok ? null : r.erreur.code;
		};
		expect(code('2026-10-11')).toBe('comptage_date_future');
		expect(code('2026-10-04')).toBe('comptage_date_anterieure');
		expect(code('2026-08-20', { ...ctx, auPlusTot: null })).toBe('date_hors_exercice');
		expect(code('2026-09-01', { ...ctx, auPlusTot: null, debutAncre: '2026-09-02' })).toBe(
			'date_hors_exercice'
		);
	});
});

describe('Écart d’une caisse (§8)', () => {
	it('sans Comptage ni constat : pas d’Écart', () => {
		expect(ecart(caisse(), CAISSE.id, JOUR)).toBeNull();
	});

	it('une Session ouverte avec Comptage final et recette à enregistrer : non expliqué nul', () => {
		const j = caisse({
			sessions: [session()],
			comptages: [ouverture(), fin()],
			operations: [mouvement(-35_00, 'pendant', { id: 1 })]
		});
		expect(sessionOuverteLe(j, CAISSE.id, JOUR)).toBe(true);
		expect(sessionOuverteLe(j, CAISSE.id, '2026-10-01')).toBe(false);
		expect(ecart(j, CAISSE.id, JOUR)).toBe(297_50);
		expect(ecartExplique(j, CAISSE.id, JOUR)).toBe(297_50);
		expect(ecartNonExplique(j, CAISSE.id, JOUR)).toBe(0);
	});

	it('après clôture, un Comptage contredit par un ticket antidaté reste non expliqué', () => {
		const j = caisse({
			comptages: [comptage({ id: 1, montant: 150_00 })],
			operations: [mouvement(-5_00, null, { id: 1, date: '2026-10-01' })]
		});
		expect(ecartNonExplique(j, CAISSE.id, JOUR)).toBe(5_00);
	});
});
