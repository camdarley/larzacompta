import { describe, expect, it } from 'vitest';
import {
	coteFigeParSession,
	rattacherCotes,
	sessionsDeSaisie
} from '#lib/domaine/caisse/saisie.ts';
import { violationsCaisses } from '#lib/domaine/caisse/verification.ts';
import {
	cartesCaisses,
	detailCaisse,
	friseCaisse,
	rangeeMesCaisses,
	sessionsDeLAction,
	vueSession
} from '#lib/domaine/caisse/vues.ts';
import { sessionsAClore } from '#lib/domaine/caisse/index.ts';
import { sessionsNonCloturees } from '#lib/domaine/etats/controle.ts';
import type { ComptageJ, GrandJournal, OperationJ, SessionJ } from '#lib/domaine/journal.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import type { CoteSaisi } from '#lib/domaine/operations/validation.ts';
import { CCP, E2026, journal, operationJ } from './aides/journal.ts';

const CAISSE = { ...CCP, id: 5, libelle: 'Caisse 2', type: 'caisse' as const };
const RESERVE = { ...CAISSE, id: 6, libelle: 'Réserve', reserve: true };
const JOUR = '2026-10-10';
const KERMESSE = { id: 7, libelle: 'Kermesse' };
const noms = { comptes: [CCP, CAISSE, RESERVE], actions: [KERMESSE] };

const comptage = (id: number, type: ComptageJ['type'], montant: number, heure = '09') =>
	({
		id,
		compteId: CAISSE.id,
		sessionCaisseId: type === 'controle' ? null : 1,
		type,
		date: JOUR,
		compteLe: `${JOUR}T${heure}:00:00.000Z`,
		saisiLe: `${JOUR}T${heure}:00:00.000Z`,
		saisiPar: 1,
		operationEcartId: null,
		coupures: [{ coupure: c(1), quantite: montant }]
	}) satisfies ComptageJ;

const session = (partiel: Partial<SessionJ> = {}): SessionJ => ({
	id: 1,
	compteId: CAISSE.id,
	actionId: KERMESSE.id,
	ouverteLe: `${JOUR}T09:00:00.000Z`,
	ouvertePar: 1,
	clotureeLe: null,
	clotureePar: null,
	operationRecetteId: null,
	...partiel
});

function mouvement(id: number, montant: number, phase: 'pendant' | 'apres_comptage' | null) {
	const op = operationJ({ id, date: JOUR, montant });
	return {
		...op,
		creeLe: `${JOUR}T12:00:00.000Z`,
		cotes: [
			{
				id: id * 10,
				operationId: id,
				compteId: CAISSE.id,
				date: JOUR,
				montant: c(montant),
				sessionCaisseId: phase ? 1 : null,
				sessionPhase: phase
			}
		]
	};
}

function transfert(id: number, montant: number, phase: 'pendant' | 'apres_comptage'): OperationJ {
	return {
		...mouvement(id, montant, phase),
		genre: 'interne',
		lignes: [],
		cotes: [
			...mouvement(id, montant, phase).cotes,
			{
				id: id * 10 + 1,
				operationId: id,
				compteId: RESERVE.id,
				date: JOUR,
				montant: c(-montant)
			}
		]
	};
}

const base = (partiel: Partial<GrandJournal> = {}) =>
	journal({
		comptes: noms.comptes,
		ancres: [{ compteId: CAISSE.id, exerciceId: E2026.id, solde: c(150_00) }],
		...partiel
	});

const recette = (id: number, montant: number): OperationJ => ({
	...mouvement(id, montant, null),
	origine: 'recette_especes'
});

describe('vues de caisse', () => {
	it('cartes : total des espèces, Session en cours, caisse désactivée et vide écartée', () => {
		const j = base({
			comptes: [...noms.comptes, { ...CAISSE, id: 8, libelle: 'Vieille', actif: false }],
			sessions: [session()],
			comptages: [comptage(1, 'ouverture', 150_00)]
		});
		const v = cartesCaisses(j, { ...noms, comptes: j.comptes }, JOUR);
		expect(v.cartes.map((x) => x.libelle)).toEqual(['Caisse 2', 'Réserve']);
		expect(v.total).toBe(150_00);
		expect(v.cartes[0]).toMatchObject({
			dernierComptage: JOUR,
			session: { id: 1, action: 'Kermesse', depuis: JOUR, comptageFinal: false }
		});
		expect(v.cartes[1]).toMatchObject({ dernierComptage: null, session: null, reserve: true });
	});

	it('frise : du plus récent au plus ancien, chaque type à son nom', () => {
		const j = base({
			sessions: [session({ clotureeLe: `${JOUR}T21:00:00.000Z`, operationRecetteId: 3 })],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 200_00, '17')],
			operations: [
				mouvement(1, -5_00, 'pendant'),
				mouvement(2, 2_00, 'pendant'),
				recette(3, 53_00),
				{ ...mouvement(4, -40, null), origine: 'ecart_caisse' },
				transfert(5, -10_00, 'apres_comptage')
			]
		});
		const types = friseCaisse(j, CAISSE.id).map((e) => e.type);
		// Le Comptage de 17 h passe avant les mouvements de midi, celui de 9 h après.
		expect(types[0]).toBe('comptage');
		expect(types.at(-1)).toBe('comptage');
		expect(new Set(types)).toEqual(
			new Set(['comptage', 'depense', 'ecart', 'entree', 'recette', 'transfert'])
		);
		const d = detailCaisse(j, noms, CAISSE, JOUR);
		expect(d.frise).toHaveLength(1);
		expect(d.pose).toMatchObject({ depart: 200_00, source: 'comptage', sorties: 10_00 });
	});

	it('détail sans Comptage : aucune addition posée, un jour par date dans la frise', () => {
		const autre = { ...mouvement(1, -5_00, null), date: '2026-10-11' };
		autre.cotes = autre.cotes.map((x) => ({ ...x, date: '2026-10-11' }));
		const j = base({ operations: [autre, mouvement(2, -1_00, null)] });
		const d = detailCaisse(j, noms, CAISSE, '2026-10-12');
		expect(d.pose).toBeNull();
		expect(d.frise.map((g) => g.date)).toEqual(['2026-10-11', JOUR]);
	});

	it('Session : Comptages, dépenses, transferts et mouvements d’après', () => {
		const j = base({
			sessions: [session()],
			comptages: [
				{ ...comptage(1, 'ouverture', 149_60), operationEcartId: 9 },
				comptage(2, 'fin', 300_00, '17')
			],
			operations: [
				mouvement(1, -35_00, 'pendant'),
				transfert(2, -100_00, 'pendant'),
				transfert(3, -60_00, 'apres_comptage'),
				{ ...mouvement(9, -40, null), origine: 'ecart_caisse' }
			]
		});
		const v = vueSession(j, noms, 1)!;
		expect(v).toMatchObject({
			caisse: 'Caisse 2',
			action: { id: 7, libelle: 'Kermesse' },
			ouverte: true,
			depuis: JOUR,
			peutRouvrir: false
		});
		expect(v.comptages.map((x) => [x.type, x.total, x.ecart])).toEqual([
			['ouverture', 149_60, -40],
			['fin', 300_00, null]
		]);
		expect(v.depenses).toHaveLength(1);
		expect(v.transferts[0]).toMatchObject({ autreCompte: 'Réserve' });
		expect(v.apres[0]).toMatchObject({ montant: -60_00, autreCompte: 'Réserve' });
		expect(v.termes?.recette).toBe(285_40);
		expect(vueSession(j, noms, 99)).toBeNull();
	});

	it('Sessions d’une Action : dans l’Exercice regardé seulement', () => {
		const j = base({
			sessions: [session()],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 200_00, '17')]
		});
		expect(sessionsDeLAction(j, noms, 7, '2026-09-01', '2027-08-31')).toEqual([
			{ id: 1, caisse: 'Caisse 2', date: JOUR, ouverte: true, recette: 50_00 }
		]);
		expect(sessionsDeLAction(j, noms, 7, '2027-09-01', '2028-08-31')).toEqual([]);
		expect(sessionsDeLAction(j, noms, 8, '2026-09-01', '2027-08-31')).toEqual([]);
	});

	it('Mes caisses : aucun chiffre', () => {
		const j = base({ sessions: [session()], comptages: [comptage(1, 'ouverture', 150_00)] });
		expect(rangeeMesCaisses(j, noms, CAISSE)).toEqual({
			compteId: 5,
			libelle: 'Caisse 2',
			reserve: false,
			ouverte: true,
			action: 'Kermesse',
			sessionId: 1,
			comptageFinal: false
		});
		expect(rangeeMesCaisses(j, noms, RESERVE)).toMatchObject({ ouverte: false, action: null });
	});

	it('E4 : les Sessions ouvertes se nomment et se comptent', () => {
		const j = base({ sessions: [session()], comptages: [comptage(1, 'ouverture', 150_00)] });
		expect(sessionsAClore(j)).toEqual([{ caisse: 'Caisse 2', date: JOUR }]);
		expect(sessionsAClore({ ...j, comptages: [] })).toEqual([]);
		expect(sessionsNonCloturees(j, E2026)).toBe(1);
		expect(sessionsNonCloturees({ ...j, comptages: [] }, E2026)).toBe(0);
	});
});

describe('rattachement au point d’écriture (C4, C12)', () => {
	const ouverte = () =>
		base({ sessions: [session()], comptages: [comptage(1, 'ouverture', 150_00)] });
	const cote: CoteSaisi = { compteId: CAISSE.id, date: JOUR, montant: c(-5_00) };
	const standard = { origine: 'saisie' as const, genre: 'standard' as const, cotes: [cote] };

	it('rattache un Côté saisi, jamais une recette ni un Écart', () => {
		expect(rattacherCotes(ouverte(), standard)[0]).toMatchObject({
			sessionCaisseId: 1,
			sessionPhase: 'pendant'
		});
		for (const origine of ['recette_especes', 'ecart_caisse'] as const) {
			expect(rattacherCotes(ouverte(), { ...standard, origine })[0]).toMatchObject({
				sessionCaisseId: null,
				sessionPhase: null
			});
		}
	});

	it('sur un autre Compte : aucun lien', () => {
		const banque = { ...standard, cotes: [{ ...cote, compteId: CCP.id }] };
		expect(rattacherCotes(ouverte(), banque)[0]?.sessionCaisseId).toBeNull();
	});

	it('une modification garde sa Session close, et sa réponse si elle ne change pas de Compte', () => {
		const avant = mouvement(1, -5_00, 'pendant');
		const close = base({ sessions: [session({ clotureeLe: `${JOUR}T21:00:00.000Z` })] });
		expect(rattacherCotes(close, standard, {}, avant)[0]).toMatchObject({
			sessionCaisseId: 1,
			sessionPhase: 'pendant'
		});
		const ailleurs = { ...standard, cotes: [{ ...cote, compteId: CCP.id }] };
		expect(rattacherCotes(close, ailleurs, {}, avant)[0]?.sessionCaisseId).toBeNull();
		const avecFinal = base({
			sessions: [session()],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 200_00, '17')]
		});
		const apres = mouvement(2, -5_00, 'apres_comptage');
		expect(rattacherCotes(avecFinal, standard, {}, apres)[0]?.sessionPhase).toBe('apres_comptage');
		expect(
			rattacherCotes(avecFinal, standard, { [CAISSE.id]: 'pendant' }, apres)[0]?.sessionPhase
		).toBe('pendant');
	});

	it('une Session clôturée fige montant, Compte et date, pas le reste', () => {
		const close = { sessions: [session({ clotureeLe: `${JOUR}T21:00:00.000Z` })] };
		const avant = mouvement(1, -5_00, 'pendant');
		expect(coteFigeParSession(close, avant, [cote])).toBe(false);
		expect(coteFigeParSession(close, avant, [{ ...cote, montant: c(-6_00) }])).toBe(true);
		expect(coteFigeParSession(close, avant, [])).toBe(true);
		expect(coteFigeParSession({ sessions: [session()] }, avant, [])).toBe(false);
		expect(coteFigeParSession(close, mouvement(2, -1_00, null), [])).toBe(false);
	});

	it('dit au `panneau` où poser sa question, sans aucun chiffre', () => {
		const j = base({
			sessions: [session()],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 200_00, '17')]
		});
		expect(sessionsDeSaisie(j)).toEqual([{ compteId: 5, sessionId: 1, dateFinale: JOUR }]);
		expect(sessionsDeSaisie(ouverte())).toEqual([{ compteId: 5, sessionId: 1, dateFinale: null }]);
	});
});

describe('C1 à C12 rejoués sur la base (ape verifier)', () => {
	const invariants = (j: GrandJournal) => violationsCaisses(j).map((v) => v.invariant);
	const close = { clotureeLe: `${JOUR}T21:00:00.000Z`, clotureePar: 1 };
	const saine = () =>
		base({
			sessions: [session({ ...close, operationRecetteId: 3 })],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 200_00, '17')],
			operations: [recette(3, 50_00)]
		});

	it('une Session saine ne dit rien, recette nulle comprise', () => {
		expect(invariants(saine())).toEqual([]);
		const nulle = base({
			sessions: [session(close)],
			comptages: [comptage(1, 'ouverture', 150_00), comptage(2, 'fin', 150_00, '17')]
		});
		expect(invariants(nulle)).toEqual([]);
	});

	it('C1 : deux Sessions ouvertes, ou une Session sur une réserve', () => {
		const deux = base({
			sessions: [session(), session({ id: 2 })],
			comptages: [
				comptage(1, 'ouverture', 150_00),
				{ ...comptage(2, 'ouverture', 1), sessionCaisseId: 2 }
			]
		});
		expect(invariants(deux)).toContain('C1');
		const reserve = base({
			sessions: [session({ compteId: RESERVE.id })],
			comptages: [comptage(1, 'ouverture', 150_00)]
		});
		expect(invariants(reserve)).toContain('C1');
	});

	it('C2 : sans ouverture, ou clôturée sans Comptage final', () => {
		expect(invariants(base({ sessions: [session()] }))).toContain('C2');
		const sansFinal = base({
			sessions: [session(close)],
			comptages: [comptage(1, 'ouverture', 150_00)]
		});
		expect(invariants(sansFinal)).toContain('C2');
	});

	it('C5, C6, C7 : recette fausse, mal datée, ou annulée', () => {
		const fausse = saine();
		fausse.operations = [recette(3, 1)];
		expect(invariants(fausse)).toContain('C5');
		const datee = saine();
		const r = recette(3, 50_00);
		datee.operations = [{ ...r, date: '2026-10-11' }];
		expect(invariants(datee)).toContain('C6');
		expect(invariants({ ...saine(), operations: [] })).toContain('C7');
	});

	it('C8 : l’Écart d’un Comptage doit exister, à sa date', () => {
		const j = base({ comptages: [{ ...comptage(1, 'controle', 1), operationEcartId: 9 }] });
		expect(invariants(j)).toContain('C8');
		const juste = {
			...j,
			operations: [{ ...mouvement(9, -40, null), origine: 'ecart_caisse' as const }]
		};
		expect(invariants(juste)).toEqual([]);
	});

	it('C4 : Côté sur un autre Compte, sans phase, ou recette rattachée', () => {
		const j = saine();
		const base2 = mouvement(1, -5_00, 'pendant');
		j.operations = [
			...j.operations,
			{ ...base2, cotes: base2.cotes.map((x) => ({ ...x, sessionPhase: null })) }
		];
		expect(invariants(j)).toContain('C4');
		const k = saine();
		const r = recette(3, 50_00);
		k.operations = [
			{
				...r,
				cotes: r.cotes.map((x) => ({ ...x, sessionCaisseId: 1, sessionPhase: 'pendant' as const }))
			}
		];
		expect(invariants(k)).toContain('C4');
	});

	it('C12 : un Côté saisi pendant la Session, resté hors d’elle', () => {
		const j = base({
			sessions: [session()],
			comptages: [comptage(1, 'ouverture', 150_00)],
			operations: [mouvement(1, -5_00, null)]
		});
		expect(invariants(j)).toContain('C12');
	});
});
