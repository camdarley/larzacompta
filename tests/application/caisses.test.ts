import { beforeEach, describe, expect, it } from 'vitest';
import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { soldeCourantCaisse } from '#lib/domaine/caisse/index.ts';
import { csvComptages } from '#lib/domaine/etats/export-complet.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type { CoupureJ } from '#lib/domaine/journal.ts';
import { centimes as c, type Centimes } from '#lib/domaine/montant.ts';
import { message, messageErreur } from '#lib/messages.ts';
import { instancePrete, valeur } from './aides/instance.ts';

type Instance = ReturnType<typeof instancePrete>;

const JOUR = '2026-10-10';
const FOND: CoupureJ[] = [{ coupure: c(5000), quantite: 3 }];
const FINAL: CoupureJ[] = [
	{ coupure: c(10000), quantite: 4 },
	{ coupure: c(1000), quantite: 1 },
	{ coupure: c(200), quantite: 1 },
	{ coupure: c(50), quantite: 1 }
];

let i: Instance;
let caisse: number;
let reserve: number;
let kermesse: number;
let compteur: AccesConnecte;

const j = () => i.app.socle.depots.operations.journal();
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);

function creerCaisse(libelle: string, solde: number, estReserve = false) {
	return valeur(
		i.app.parametrage.creerCompte(i.ctx(), {
			libelle,
			type: 'caisse',
			reserve: estReserve,
			ancre: { exerciceId: i.courant.id, solde: c(solde) }
		})
	);
}

const ouvrir = (
	coupures = FOND,
	o: { confirmation?: Centimes | null; compteId?: number; date?: string; ctx?: unknown } = {}
) =>
	i.app.caisses.compterCaisse((o.ctx ?? i.ctx()) as ReturnType<Instance['ctx']>, {
		compteId: o.compteId ?? caisse,
		actionId: kermesse,
		coupures,
		date: o.date ?? JOUR,
		confirmation: o.confirmation ?? null
	});

const session = (
	id: number,
	coupures = FINAL,
	date = JOUR,
	corriger = false,
	confirmation: Centimes | null = null
) =>
	i.app.caisses.compterSession(i.ctx(), { sessionId: id, coupures, date, confirmation, corriger });

const depenseCaisse = (
	montant: number,
	date = JOUR,
	phases?: Record<string, 'pendant' | 'apres_comptage'>
) =>
	valeur(
		i.app.operations.creer(i.ctx(), {
			...i.saisie('depense', montant, { compteId: caisse, date, modePaiement: 'especes' }),
			phases
		})
	).id;

const transfert = (montant: number, phases?: Record<string, 'pendant' | 'apres_comptage'>) =>
	valeur(
		i.app.operations.creer(i.ctx(), {
			forme: 'interne',
			libelle: 'Vers la réserve',
			note: null,
			reference: null,
			deId: caisse,
			versId: reserve,
			montant: c(montant),
			parti: JOUR,
			arrive: JOUR,
			phases
		})
	).id;

beforeEach(() => {
	i = instancePrete();
	i.horloge.instant = '2026-10-10T08:00:00.000Z';
	kermesse = valeur(
		i.app.parametrage.modifierAction(i.ctx(), {
			id: i.actionId,
			libelle: 'Kermesse',
			groupeId: i.app.socle.depots.parametrage.groupes()[0]!.id,
			avecCaisse: true
		})
	)
		? i.actionId
		: 0;
	caisse = creerCaisse('Caisse 2', 150_00);
	reserve = creerCaisse('Réserve', 500_00, true);
	const id = i.app.socle.depots.acces.creer({
		identifiant: 'sam',
		nomAffiche: 'Sam',
		role: 'compteur',
		hash: 'test$x',
		creeLe: i.horloge.instant
	});
	compteur = {
		id,
		identifiant: 'sam',
		nomAffiche: 'Sam',
		role: 'compteur',
		preferences: { theme: 'systeme', raccourcis: true }
	};
	i.app.socle.depots.acces.definirCaisses(id, [caisse]);
	i.horloge.instant = '2026-10-10T09:00:00.000Z';
});

const ctxSam = () => i.app.ctx(compteur);

describe('Session et Comptage d’ouverture (C1, C2, C3)', () => {
	it('C2 : Session et Comptage naissent ensemble, C3 : le Fond égale ce Comptage, sans copie', () => {
		const { sessionId } = valeur(ouvrir());
		const v = valeur(i.app.caisses.session(i.ctx(), sessionId!));
		expect(v.comptages.map((x) => [x.type, x.total])).toEqual([['ouverture', 150_00]]);
		expect(j().comptages).toHaveLength(1);
		expect(i.journal().at(-1)?.evenement).toBe('session.ouverte');
	});

	it('C1 : une seconde Session sur la même caisse est refusée', () => {
		valeur(ouvrir());
		expect(code(ouvrir())).toBe('session_invalide');
	});

	it('C1 : aucune Session sur une caisse de réserve', () => {
		expect(
			valeur(ouvrir(FOND, { compteId: reserve, confirmation: c(150_00) })).sessionId
		).toBeNull();
		expect(j().sessions).toHaveLength(0);
	});

	it('plusieurs caisses s’ouvrent sur une même Action', () => {
		const autre = creerCaisse('Caisse 3', 0);
		valeur(ouvrir());
		valeur(ouvrir([], { compteId: autre }));
		expect(j().sessions.filter((s) => s.actionId === kermesse)).toHaveLength(2);
	});

	it('l’Action vient de celles « avec caisse », ou « Sans Action »', () => {
		const groupeId = i.app.socle.depots.parametrage.groupes()[0]!.id;
		const sansCaisse = valeur(
			i.app.parametrage.creerAction(i.ctx(), { libelle: 'Loto', groupeId, avecCaisse: false })
		);
		const entree = { compteId: caisse, coupures: FOND, date: JOUR, confirmation: null };
		expect(code(i.app.caisses.compterCaisse(i.ctx(), { ...entree, actionId: sansCaisse }))).toBe(
			'reference_inactive'
		);
		expect(code(i.app.caisses.compterCaisse(i.ctx(), entree))).toBe('saisie_invalide');
		expect(i.app.caisses.compterCaisse(i.ctx(), { ...entree, actionId: null }).ok).toBe(true);
	});

	it('refuse un Comptage daté de demain, ou avant le précédent', () => {
		expect(code(ouvrir(FOND, { date: '2026-10-11' }))).toBe('comptage_date_future');
		valeur(ouvrir(FOND, { date: '2026-10-05' }));
	});
});

describe('Solde attendu et recomptage (C8, C9)', () => {
	const MOINS = [
		{ coupure: c(5000), quantite: 2 },
		{ coupure: c(1000), quantite: 4 },
		{ coupure: c(500), quantite: 1 },
		{ coupure: c(200), quantite: 2 },
		{ coupure: c(50), quantite: 1 },
		{ coupure: c(10), quantite: 1 }
	];

	it('C9 : une différence à l’ouverture demande un recomptage, sans rien écrire', () => {
		const r = ouvrir(MOINS);
		expect(code(r)).toBe('recomptage_requis');
		expect(j().sessions).toHaveLength(0);
		expect(j().comptages).toHaveLength(0);
		if (!r.ok) expect(messageErreur(r.erreur)).toMatch(/0,40.€ de moins que le solde attendu/);
		if (!r.ok) {
			expect(message('comptage_ouverture_different', r.erreur.details)).toMatch(
				/^Vous avez compté 0,40.€ de moins que la dernière clôture\. Ça arrive\. Recomptez une fois pour vérifier\.$/
			);
		}
	});

	it('C8 : le même total confirme, et crée un Écart de caisse daté, de Nature système', () => {
		const { ecart } = valeur(ouvrir(MOINS, { confirmation: c(149_60) }));
		expect(ecart).toBe(-40);
		const op = j().operations.find((o) => o.origine === 'ecart_caisse')!;
		expect(op).toMatchObject({ date: JOUR, sansPiece: true, modePaiement: 'especes' });
		expect(op.cotes[0]).toMatchObject({ montant: -40, sessionCaisseId: null, sessionPhase: null });
		const nature = i.app.socle.depots.parametrage
			.natures()
			.find((n) => n.id === op.lignes[0]?.natureId);
		expect(nature?.codeSysteme).toBe('ecart_caisse');
		expect(j().comptages[0]?.operationEcartId).toBe(op.id);
		expect(soldeCompte(j(), caisse, JOUR)).toBe(149_60);
		expect(soldeCourantCaisse(j(), caisse, { jour: JOUR })).toBe(149_60);
	});

	it('C9 : la caisse de réserve compare aussi, un Comptage égal passe directement', () => {
		const juste = [{ coupure: c(10000), quantite: 5 }];
		expect(valeur(ouvrir(juste, { compteId: reserve })).ecart).toBe(0);
		expect(j().comptages[0]?.type).toBe('controle');
		i.horloge.instant = '2026-10-10T10:00:00.000Z';
		const faux = [{ coupure: c(10000), quantite: 4 }];
		expect(code(ouvrir(faux, { compteId: reserve }))).toBe('recomptage_requis');
		expect(valeur(ouvrir(faux, { compteId: reserve, confirmation: c(400_00) })).ecart).toBe(
			-100_00
		);
		expect(soldeCompte(j(), reserve, JOUR)).toBe(400_00);
	});

	it('C9 : un Comptage final n’est comparé à rien', () => {
		const { sessionId } = valeur(ouvrir());
		expect(valeur(session(sessionId!)).ecart).toBe(0);
		expect(j().operations.filter((o) => o.origine === 'ecart_caisse')).toHaveLength(0);
	});

	it('le dernier constat du jalon 1 donne le solde attendu du premier Comptage (AD-22)', () => {
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: caisse,
				date: '2026-10-01',
				solde: c(120_00)
			})
		);
		const ecran = valeur(i.app.caisses.ecranCaisse(i.ctx(), caisse));
		expect(ecran).toMatchObject({ mode: 'ouverture', quantites: [], message: null });
		expect(code(ouvrir(FOND))).toBe('recomptage_requis');
		expect(valeur(ouvrir([{ coupure: c(2000), quantite: 6 }])).ecart).toBe(0);
	});
});

describe('Comptage d’ouverture prérempli (FR-17)', () => {
	it('reprend le dernier Comptage, ou reste vide si la caisse a bougé', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		i.horloge.instant = '2026-10-10T20:00:00.000Z';
		expect(valeur(i.app.caisses.ecranCaisse(i.ctx(), caisse))).toMatchObject({
			message: 'repris',
			quantites: FINAL
		});
		depenseCaisse(10_00, '2026-10-10');
		expect(valeur(i.app.caisses.ecranCaisse(i.ctx(), caisse))).toMatchObject({
			message: 'a_compter',
			quantites: []
		});
		// Le solde attendu reste soldeCourantCaisse.
		expect(soldeCourantCaisse(j(), caisse, { jour: JOUR })).toBe(402_50);
	});

	it('une caisse ouverte renvoie à sa Session', () => {
		const { sessionId } = valeur(ouvrir());
		expect(valeur(i.app.caisses.ecranCaisse(i.ctx(), caisse))).toEqual({ sessionId });
	});
});

describe('Mouvements de Session (C4, C12)', () => {
	it('C12 : un Côté saisi depuis Nouvelle Opération se rattache à la Session ouverte', () => {
		const { sessionId } = valeur(ouvrir());
		const op = i.app.socle.depots.operations.parId(depenseCaisse(35_00))!;
		expect(op.cotes[0]).toMatchObject({ sessionCaisseId: sessionId, sessionPhase: 'pendant' });
	});

	it('C4 : recette et Écart ne portent jamais de Session, un Côté en porte une phase non nulle', () => {
		const { sessionId } = valeur(ouvrir());
		depenseCaisse(5_00);
		valeur(session(sessionId!));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		for (const op of j().operations) {
			const c0 = op.cotes[0]!;
			if (op.origine === 'recette_especes') expect(c0.sessionCaisseId).toBeNull();
			else expect(c0.sessionPhase).not.toBeNull();
		}
	});

	it('après le Comptage final : Oui par défaut pour un transfert, Non pour une dépense', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		const d = i.app.socle.depots.operations.parId(depenseCaisse(35_00))!;
		const t = i.app.socle.depots.operations.parId(transfert(60_00))!;
		expect(d.cotes[0]?.sessionPhase).toBe('pendant');
		const sortant = t.cotes.find((x) => x.compteId === caisse);
		expect(sortant?.sessionPhase).toBe('apres_comptage');
		expect(t.cotes.find((x) => x.compteId === reserve)?.sessionCaisseId).toBeNull();
	});

	it('la réponse du formulaire s’applique, le même jour seulement', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		const t = i.app.socle.depots.operations.parId(transfert(60_00, { [caisse]: 'pendant' }))!;
		expect(t.cotes.find((x) => x.compteId === caisse)?.sessionPhase).toBe('pendant');
		i.horloge.instant = '2026-10-12T09:00:00.000Z';
		const d = i.app.socle.depots.operations.parId(
			depenseCaisse(1_00, '2026-10-11', { [caisse]: 'pendant' })
		)!;
		expect(d.cotes[0]?.sessionPhase).toBe('apres_comptage');
	});

	it('un dépôt en banque sort de la caisse, et se pointe ensuite comme tout Côté', () => {
		const { sessionId } = valeur(ouvrir());
		const id = valeur(
			i.app.operations.creer(i.ctx(), {
				forme: 'interne',
				libelle: 'Dépôt fictif',
				note: null,
				reference: null,
				deId: caisse,
				versId: i.compteId,
				montant: c(100_00),
				parti: JOUR,
				arrive: JOUR
			})
		).id;
		valeur(session(sessionId!));
		expect(valeur(i.app.caisses.session(i.ctx(), sessionId!)).termes?.transfertsSortants).toBe(
			100_00
		);
		expect(
			i.app.socle.depots.operations.parId(id)?.cotes.find((x) => x.compteId === i.compteId)
				?.sessionCaisseId
		).toBeNull();
	});

	it('le transfert apparaît dans le suivi des deux caisses', () => {
		valeur(ouvrir());
		transfert(60_00);
		for (const id of [caisse, reserve]) {
			const types = valeur(i.app.caisses.detail(i.ctx(), id)).frise.flatMap((g) =>
				g.evenements.map((e) => e.type)
			);
			expect(types).toContain('transfert');
		}
	});

	it('une Opération d’une Session clôturée ne bouge plus sans la rouvrir', () => {
		const { sessionId } = valeur(ouvrir());
		const id = depenseCaisse(35_00);
		valeur(session(sessionId!));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		const op = i.app.socle.depots.operations.parId(id)!;
		const saisie = i.saisie('depense', 40_00, { compteId: caisse, date: JOUR });
		expect(code(i.app.operations.annuler(i.ctx(), id))).toBe('session_cloturee');
		expect(code(i.app.operations.modifier(i.ctx(), { id, version: op.version, saisie }))).toBe(
			'session_cloturee'
		);
		// Le texte reste libre.
		const texte = i.saisie('depense', 35_00, {
			compteId: caisse,
			date: JOUR,
			libelle: 'Autre libellé',
			modePaiement: 'especes'
		});
		expect(i.app.operations.modifier(i.ctx(), { id, version: op.version, saisie: texte }).ok).toBe(
			true
		);
		valeur(i.app.caisses.rouvrir(i.ctx(), sessionId!));
		expect(i.app.operations.annuler(i.ctx(), id).ok).toBe(true);
	});
});

describe('Clôture de Session (C5, C6, UJ-2)', () => {
	it('C5, C6 : la recette entre dans l’Action, datée du Comptage final, sans ressaisie', () => {
		const { sessionId } = valeur(ouvrir());
		depenseCaisse(35_00);
		transfert(100_00, { [caisse]: 'pendant' });
		valeur(session(sessionId!));
		transfert(60_00);
		const v = valeur(i.app.caisses.session(i.ctx(), sessionId!));
		expect(v.termes).toEqual({
			comptageFinal: 412_50,
			fond: 150_00,
			depenses: 35_00,
			transfertsSortants: 100_00,
			transfertsEntrants: 0,
			recette: 397_50
		});
		expect(v.apres).toHaveLength(1);
		const r = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(r.recette).toBe(397_50);
		const op = i.app.socle.depots.operations.parId(r.operationId!)!;
		expect(op).toMatchObject({ origine: 'recette_especes', date: JOUR, sansPiece: true });
		expect(op.lignes[0]).toMatchObject({ montant: 397_50, actionId: kermesse });
		const action = valeur(i.app.etats.action(i.ctx(), i.courant, kermesse));
		expect(action.action?.recettes).toBe(397_50);
		// Les deux lectures s'égalent après clôture.
		expect(soldeCourantCaisse(j(), caisse, { jour: JOUR })).toBe(soldeCompte(j(), caisse, JOUR));
		expect(soldeCompte(j(), caisse, JOUR)).toBe(352_50);
	});

	it('C2 : sans Comptage final, la clôture est refusée', () => {
		const { sessionId } = valeur(ouvrir());
		expect(code(i.app.caisses.cloturer(i.ctx(), sessionId!))).toBe('comptage_manquant');
	});

	it('C6 : une recette nulle ne crée aucune Opération', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!, FOND));
		const r = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(r).toEqual({ recette: 0, operationId: null });
		expect(j().operations).toHaveLength(0);
	});

	it('C6 : une recette négative crée une Ligne négative', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!, [{ coupure: c(5000), quantite: 2 }]));
		const r = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(r.recette).toBe(-50_00);
		expect(i.app.socle.depots.operations.parId(r.operationId!)?.lignes[0]?.montant).toBe(-50_00);
	});

	it('O9 : une recette ne se modifie par la saisie générique que dans son texte', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		const { operationId } = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(code(i.app.operations.annuler(i.ctx(), operationId!))).toBe('operation_geree_ailleurs');
	});

	it('refuse la clôture à un·e compteur·se (§2.2)', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		expect(code(i.app.caisses.cloturer(ctxSam(), sessionId!))).toBe('acces_refuse');
		expect(code(i.app.caisses.rouvrir(ctxSam(), sessionId!))).toBe('acces_refuse');
	});
});

describe('Réouverture (C7)', () => {
	it('C7 : l’Opération de recette s’annule, et la prochaine clôture la recalcule', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		const { operationId } = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		valeur(i.app.caisses.rouvrir(i.ctx(), sessionId!));
		expect(j().operationsAnnulees.map((o) => o.id)).toEqual([operationId]);
		expect(j().sessions[0]).toMatchObject({ clotureeLe: null, operationRecetteId: null });
		depenseCaisse(10_00);
		const r = valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(r.recette).toBe(272_50);
	});

	it('C7 : refusée pour une Session plus ancienne', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		i.horloge.instant = '2026-10-10T22:00:00.000Z';
		valeur(ouvrir(FINAL, { date: JOUR }));
		expect(code(i.app.caisses.rouvrir(i.ctx(), sessionId!))).toBe('session_invalide');
	});
});

describe('Correction d’un Comptage (C11)', () => {
	const MOINS = [
		{ coupure: c(5000), quantite: 2 },
		{ coupure: c(2000), quantite: 2 }
	];

	it('C11 : l’Écart lié s’annule, puis se recrée si besoin', () => {
		const { sessionId } = valeur(ouvrir(MOINS, { confirmation: c(140_00) }));
		const premier = j().operations.find((o) => o.origine === 'ecart_caisse')!;
		expect(code(session(sessionId!, [{ coupure: c(5000), quantite: 1 }], JOUR, true))).toBe(
			'recomptage_requis'
		);
		expect(j().operations.find((o) => o.id === premier.id)).toBeDefined();
		const autre = [
			{ coupure: c(5000), quantite: 2 },
			{ coupure: c(2000), quantite: 2 },
			{ coupure: c(500), quantite: 1 }
		];
		const r = valeur(session(sessionId!, autre, JOUR, true, c(145_00)));
		expect(r.ecart).toBe(-5_00);
		expect(j().operationsAnnulees.map((o) => o.id)).toEqual([premier.id]);
		const nouvel = j().operations.filter((o) => o.origine === 'ecart_caisse');
		expect(nouvel).toHaveLength(1);
		expect(j().comptages[0]?.operationEcartId).toBe(nouvel[0]?.id);
		expect(valeur(i.app.caisses.session(i.ctx(), sessionId!)).comptages[0]?.total).toBe(145_00);
	});

	it('C11 : juste après correction, plus aucun Écart', () => {
		const { sessionId } = valeur(ouvrir(MOINS, { confirmation: c(140_00) }));
		valeur(session(sessionId!, FOND, JOUR, true));
		expect(j().operations).toHaveLength(0);
		expect(j().comptages[0]?.operationEcartId).toBeNull();
	});

	it('corrige le Comptage final tant que la Session n’est pas clôturée', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		expect(valeur(session(sessionId!, FOND, JOUR, true)).ecart).toBe(0);
		expect(valeur(i.app.caisses.session(i.ctx(), sessionId!)).termes?.comptageFinal).toBe(150_00);
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		expect(code(session(sessionId!, FINAL, JOUR, true))).toBe('session_invalide');
	});

	it('un Comptage oublié se saisit après coup, avec sa date réelle (FR-17)', () => {
		const { sessionId } = valeur(ouvrir());
		i.horloge.instant = '2026-10-12T09:00:00.000Z';
		valeur(session(sessionId!, FINAL, '2026-10-10'));
		expect(j().comptages.find((x) => x.type === 'fin')).toMatchObject({
			date: '2026-10-10',
			saisiLe: '2026-10-12T09:00:00.000Z'
		});
		expect(code(ouvrir(FOND, { date: '2026-10-11' }))).toBe('session_invalide');
	});

	it('un Comptage final ne précède pas l’ouverture', () => {
		const { sessionId } = valeur(ouvrir());
		expect(code(session(sessionId!, FINAL, '2026-10-09'))).toBe('comptage_date_anterieure');
	});
});

describe('Compteur·se (A3, C10)', () => {
	it('A3 : ouvre et compte ses caisses, refuse les autres, lecture comprise', () => {
		expect(ouvrir(FOND, { ctx: ctxSam() }).ok).toBe(true);
		expect(code(ouvrir(FOND, { ctx: ctxSam(), compteId: reserve }))).toBe('acces_refuse');
		expect(code(i.app.caisses.ecranCaisse(ctxSam(), reserve))).toBe('acces_refuse');
		for (const r of [
			i.app.caisses.liste(ctxSam()),
			i.app.caisses.detail(ctxSam(), caisse),
			i.app.caisses.session(ctxSam(), 1),
			i.app.operations.journal(ctxSam()),
			i.app.operations.creer(ctxSam(), i.saisie('depense', 1_00, { compteId: caisse, date: JOUR }))
		]) {
			expect(code(r)).toBe('acces_refuse');
		}
	});

	it('A3 : l’Écart issu de son Comptage s’écrit, sans lui donner le droit de saisir', () => {
		const faux = [{ coupure: c(5000), quantite: 2 }];
		expect(code(ouvrir(faux, { ctx: ctxSam() }))).toBe('recomptage_requis');
		expect(valeur(ouvrir(faux, { ctx: ctxSam(), confirmation: c(100_00) })).ecart).toBe(-50_00);
		expect(j().operations[0]?.origine).toBe('ecart_caisse');
	});

	it('C10 : Mes caisses et le Comptage final ne montrent jamais de chiffre attendu', () => {
		const { sessionId } = valeur(ouvrir(FOND, { ctx: ctxSam() }));
		const rangees = valeur(i.app.caisses.mesCaisses(ctxSam()));
		expect(rangees).toEqual([
			{
				compteId: caisse,
				libelle: 'Caisse 2',
				reserve: false,
				ouverte: true,
				action: 'Kermesse',
				sessionId,
				comptageFinal: false
			}
		]);
		const ecran = valeur(i.app.caisses.ecranSession(ctxSam(), sessionId!, false));
		expect(ecran).toMatchObject({ mode: 'fin', correction: false, quantites: [] });
		const texte = JSON.stringify(ecran);
		expect(texte).not.toMatch(/recette|attendu|solde|15000/i);
		expect(
			valeur(
				i.app.caisses.compterSession(ctxSam(), {
					sessionId: sessionId!,
					coupures: FINAL,
					date: JOUR,
					confirmation: null
				})
			)
		).toEqual({ sessionId, ecart: 0 });
	});

	it('une instance qui démarre reçoit le Compte des chèques, à solde nul, hors de la saisie', () => {
		const cheques = i.app.socle.depots.parametrage
			.comptes()
			.filter((x) => x.type === 'cheques_a_remettre');
		expect(cheques).toHaveLength(1);
		expect(soldeCompte(j(), cheques[0]!.id, JOUR)).toBe(0);
		const saisie = valeur(i.app.operations.contexteSaisie(i.ctx()));
		expect(saisie.comptes.some((x) => x.id === cheques[0]!.id)).toBe(false);
		expect(valeur(i.app.parametrage.comptes(i.ctx())).some((x) => x.id === cheques[0]!.id)).toBe(
			false
		);
	});

	it('la trésorerie voit toutes les caisses dans Mes caisses', () => {
		expect(valeur(i.app.caisses.mesCaisses(i.ctx())).map((r) => r.libelle)).toEqual([
			'Caisse 2',
			'Réserve'
		]);
	});

	it('Réglages : un Accès compteur·se enregistre ses caisses, une banque est refusée', () => {
		const cree = valeur(
			i.app.acces.creer(i.ctx(), {
				identifiant: 'alex',
				nomAffiche: 'Alex',
				role: 'compteur',
				caisses: [caisse, reserve]
			})
		);
		expect(i.app.socle.depots.acces.caissesDe(cree.id)).toEqual([caisse, reserve]);
		expect(valeur(i.app.acces.lister(i.ctx())).find((a) => a.id === cree.id)?.caisses).toEqual([
			caisse,
			reserve
		]);
		valeur(i.app.acces.definirCaisses(i.ctx(), { id: cree.id, caisses: [reserve] }));
		expect(i.app.socle.depots.acces.caissesDe(cree.id)).toEqual([reserve]);
		expect(code(i.app.acces.definirCaisses(i.ctx(), { id: cree.id, caisses: [i.compteId] }))).toBe(
			'element_introuvable'
		);
	});
});

describe('Caisses dans le contrôle (E4, §8)', () => {
	it('E4 : une Session ouverte datée dans l’Exercice se nomme, et bloque la clôture', () => {
		valeur(ouvrir());
		const r = i.app.exercices.cloturer(i.ctx(), i.courant.id);
		expect(r).toMatchObject({
			ok: false,
			erreur: { code: 'session_a_cloturer', details: { caisse: 'Caisse 2' } }
		});
		expect(valeur(i.app.exercices.recapitulatifCloture(i.ctx(), i.courant.id)).refus?.code).toBe(
			'session_a_cloturer'
		);
	});

	it('la carte montre solde et date du dernier Comptage, la tuile compte les Sessions', () => {
		const { sessionId } = valeur(ouvrir());
		valeur(session(sessionId!));
		const t = valeur(i.app.etats.tableau(i.ctx(), i.courant));
		const carte = t.cartes.find((x) => x.compte.id === caisse)!;
		expect(carte).toMatchObject({
			dateConstat: JOUR,
			constate: 412_50,
			sessionOuverte: true,
			nonExplique: 0
		});
		expect(carte.phraseEcart).toMatch(/Recette d’espèces reste à enregistrer/);
		expect(t.taches.find((x) => x.id === 'sessions')?.compteur).toBe(1);
		expect(t.bilan.type).not.toBe('ecart');
	});

	it('un Écart de caisse enregistré n’est pas un Écart non expliqué', () => {
		const { sessionId } = valeur(
			ouvrir([{ coupure: c(5000), quantite: 2 }], { confirmation: c(100_00) })
		);
		valeur(session(sessionId!, [{ coupure: c(5000), quantite: 2 }]));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		const t = valeur(i.app.etats.tableau(i.ctx(), i.courant));
		expect(t.cartes.find((x) => x.compte.id === caisse)).toMatchObject({
			ecart: 0,
			nonExplique: 0,
			etat: 'juste'
		});
		expect(t.taches.find((x) => x.id === 'sessions')?.compteur).toBe(0);
	});

	it('/caisses totalise les espèces, chaque carte dit sa Session', () => {
		const { sessionId } = valeur(ouvrir());
		const v = valeur(i.app.caisses.liste(i.ctx()));
		expect(v.total).toBe(650_00);
		expect(v.cartes[0]).toMatchObject({
			libelle: 'Caisse 2',
			solde: 150_00,
			dernierComptage: JOUR,
			session: { id: sessionId, action: 'Kermesse' }
		});
		expect(v.cartes[1]).toMatchObject({ libelle: 'Réserve', reserve: true, session: null });
	});

	it('/caisses/[id] pose le calcul depuis le dernier Comptage et date sa frise', () => {
		const { sessionId } = valeur(ouvrir());
		i.horloge.instant = '2026-10-10T12:00:00.000Z';
		depenseCaisse(35_00);
		const d = valeur(i.app.caisses.detail(i.ctx(), caisse));
		expect(d.pose).toEqual({
			date: JOUR,
			depart: 150_00,
			source: 'comptage',
			entrees: 0,
			sorties: 35_00
		});
		expect(d.carte.solde).toBe(115_00);
		expect(d.frise[0]?.evenements.map((e) => e.type)).toEqual(['depense', 'comptage']);
		expect(
			valeur(i.app.caisses.sessionsDeLAction(i.ctx(), kermesse, i.courant)).map((s) => s.id)
		).toEqual([sessionId]);
	});

	it('l’export complet emporte les Comptages, lisibles sans l’outil', async () => {
		valeur(ouvrir());
		const table = csvComptages(j(), { comptes: j().comptes });
		expect(table.lignes).toEqual([
			['2026-10-10', 'Caisse 2', 'Comptage d’ouverture', '150,00', '3 × 50,00', '1']
		]);
	});

	it('ape verifier ne voit rien sur une caisse saine, et rejoue C1 à C12 sur une base altérée', () => {
		const { sessionId } = valeur(ouvrir());
		depenseCaisse(35_00);
		valeur(session(sessionId!));
		valeur(i.app.caisses.cloturer(i.ctx(), sessionId!));
		const verifier = () => valeur(i.app.etats.verifier(i.ctx())).map((v) => v.invariant);
		expect(verifier()).toEqual([]);
		const op = j().sessions[0]!.operationRecetteId!;
		i.base.prepare('UPDATE ligne SET montant_centimes = 1 WHERE operation_id = ?').run(op);
		i.base.prepare('UPDATE cote SET montant_centimes = 1 WHERE operation_id = ?').run(op);
		expect(verifier()).toContain('C5');
		i.base.prepare('UPDATE session_caisse SET cloturee_le = NULL').run();
		i.base
			.prepare(`UPDATE cote SET session_phase = NULL WHERE session_caisse_id IS NOT NULL`)
			.run();
		expect(verifier()).toContain('C4');
		i.base.prepare(`DELETE FROM comptage WHERE type = 'ouverture'`).run();
		expect(verifier()).toContain('C2');
	});
});
