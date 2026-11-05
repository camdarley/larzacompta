import { beforeEach, describe, expect, it } from 'vitest';
import { etatChequeRecu, totalEnAttente } from '#lib/domaine/cheques/index.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import { centimes as c, type Centimes } from '#lib/domaine/montant.ts';
import type { Ctx } from '#lib/server/application/executer.ts';
import { instanceFictive, type InstanceFictive } from './aides/fictive.ts';
import { instancePrete, valeur } from './aides/instance.ts';

type Instance = ReturnType<typeof instancePrete>;

const JOUR = '2026-10-10';
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);

let i: Instance;
let compteCheques: number;

const j = () => i.app.socle.depots.operations.journal();
const app = () => i.app;

function ligne(montant: number, actionId: number | null = i.actionId) {
	return {
		montant: c(montant),
		contraire: false,
		reduction: false,
		natureId: i.natureId,
		actionId,
		exerciceRattachementId: null,
		note: null
	};
}

function recu(
	montant: number,
	o: Partial<{ emetteur: string; date: string; lignes: ReturnType<typeof ligne>[] }> = {}
) {
	return app().cheques.enregistrerRecu(i.ctx(), {
		emetteur: o.emetteur ?? 'Famille Imaginaire',
		banque: 'Banque Fictive',
		numero: null,
		date: o.date ?? JOUR,
		montant: c(montant),
		lignes: o.lignes ?? [ligne(montant)]
	});
}

function remettre(ids: number[], total: number, date = JOUR, compteId = i.compteId) {
	return app().cheques.creerRemise(i.ctx(), { chequeIds: ids, compteId, date, total: c(total) });
}

const cheque = (id: number) => j().chequesRecus.find((x) => x.id === id)!;
const etat = (id: number) => etatChequeRecu(j(), cheque(id));

function sortie(montant: number, numero: string | null, partiel = {}) {
	return i.saisie('depense', montant, {
		modePaiement: 'cheque',
		reference: numero,
		tiers: 'Autocars imaginaires',
		...partiel
	});
}

const pointer = (coteIds: number[], ligneIds: number[], compteId = i.compteId) =>
	valeur(app().pointage.pointer(i.ctx(), { compteId, coteIds, ligneIds }));

function ligneReleve(montant: number, libelle: string, date = JOUR) {
	return valeur(
		app().pointage.saisirLigne(i.ctx(), {
			compteId: i.compteId,
			date,
			montant: c(montant),
			libelle
		})
	).id;
}

const coteEntree = (remiseId: number) => {
	const op = j().operations.find(
		(o) => o.id === j().remises.find((r) => r.id === remiseId)?.operationId
	)!;
	return op.cotes.find((x) => x.montant > 0)!.id;
};

beforeEach(() => {
	i = instancePrete();
	compteCheques = i.app.socle.depots.parametrage
		.comptes()
		.find((x) => x.type === 'cheques_a_remettre')!.id;
});

describe('Chèque reçu', () => {
	it('Q1 : naît avec une Opération standard sur les chèques à remettre, Lignes par Action', () => {
		const id = valeur(recu(120_00, { lignes: [ligne(100_00), ligne(20_00, null)] })).id;
		const op = j().operations.find((o) => o.id === cheque(id).operationId)!;
		expect(op.genre).toBe('standard');
		expect(op.origine).toBe('cheque_recu');
		expect(op.cotes).toHaveLength(1);
		expect(op.cotes[0]).toMatchObject({ compteId: compteCheques, montant: 120_00 });
		expect(op.lignes.map((l) => l.montant)).toEqual([100_00, 20_00]);
		expect(op.sansPiece).toBe(true);
		expect(etat(id)).toBe('en_attente');
	});

	it('O1 : une ventilation qui ne tombe pas juste est refusée, rien ne reste', () => {
		const r = recu(120_00, { lignes: [ligne(100_00)] });
		expect(code(r)).toBe('ventilation_incomplete');
		expect(j().chequesRecus).toHaveLength(0);
		expect(j().operations).toHaveLength(0);
	});

	it('une même clé de saisie n’enregistre pas deux fois', () => {
		const e = {
			emetteur: 'Famille Imaginaire',
			banque: null,
			numero: null,
			date: JOUR,
			montant: c(10_00),
			lignes: [ligne(10_00)],
			cle: 'cle-de-saisie-1'
		};
		valeur(app().cheques.enregistrerRecu(i.ctx(), e));
		valeur(app().cheques.enregistrerRecu(i.ctx(), e));
		expect(j().chequesRecus).toHaveLength(1);
	});

	it('Q3 : le solde des chèques à remettre égale ceux en attente, à toute date', () => {
		const a = valeur(recu(100_00, { date: '2026-10-01' })).id;
		const b = valeur(recu(50_00, { date: '2026-10-05' })).id;
		const d = valeur(recu(30_00, { date: '2026-10-06' })).id;
		valeur(remettre([a], 100_00, '2026-10-08'));
		valeur(app().cheques.rejeter(i.ctx(), { id: d, date: '2026-10-09' }));
		const attendu: [string, number][] = [
			['2026-09-30', 0],
			['2026-10-01', 100_00],
			['2026-10-05', 150_00],
			['2026-10-07', 180_00],
			['2026-10-08', 80_00],
			['2026-10-09', 50_00]
		];
		for (const [date, total] of attendu) {
			expect(totalEnAttente(j(), date)).toBe(total);
			expect(soldeCompte(j(), compteCheques, date)).toBe(total);
		}
		expect(etat(b)).toBe('en_attente');
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('Q4 : un chèque remis ne se modifie pas, un chèque en attente si', () => {
		const id = valeur(recu(40_00)).id;
		const fiche = valeur(app().cheques.fiche(i.ctx(), id));
		const modification = {
			id,
			version: fiche.operation.version,
			emetteur: 'Famille Corrigée',
			banque: null,
			numero: '1234',
			date: JOUR,
			montant: c(45_00),
			lignes: [ligne(45_00)]
		};
		valeur(app().cheques.modifierRecu(i.ctx(), modification));
		expect(cheque(id).emetteur).toBe('Famille Corrigée');
		expect(j().operations.find((o) => o.id === cheque(id).operationId)?.libelle).toBe(
			'Chèque de Famille Corrigée'
		);
		expect(soldeCompte(j(), compteCheques, JOUR)).toBe(45_00);

		valeur(remettre([id], 45_00));
		const r = app().cheques.modifierRecu(i.ctx(), { ...modification, version: 2 });
		expect(code(r)).toBe('cheque_remis');
		expect(code(app().cheques.annulerRecu(i.ctx(), id))).toBe('cheque_remis');
	});

	it('O9 : son Opération ne se modifie ni ne s’annule par la saisie générique', () => {
		const id = valeur(recu(40_00)).id;
		const operationId = cheque(id).operationId;
		expect(code(app().operations.annuler(i.ctx(), operationId))).toBe('operation_geree_ailleurs');
	});

	it('s’annule tant qu’il attend, et sort du registre comme des calculs', () => {
		const id = valeur(recu(40_00)).id;
		valeur(app().cheques.annulerRecu(i.ctx(), id));
		expect(j().chequesRecus).toHaveLength(0);
		expect(soldeCompte(j(), compteCheques, JOUR)).toBe(0);
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('A3 : ni le·la lecteur·rice, ni le·la compteur·se ne l’enregistrent', () => {
		const lecteur = app().ctx({ ...i.tresorier, role: 'lecteur' });
		const compteur = app().ctx({ ...i.tresorier, role: 'compteur' });
		const e = {
			emetteur: 'X',
			banque: null,
			numero: null,
			date: JOUR,
			montant: c(1_00),
			lignes: [ligne(1_00)]
		};
		expect(code(app().cheques.enregistrerRecu(lecteur, e))).toBe('acces_refuse');
		expect(code(app().cheques.enregistrerRecu(compteur, e))).toBe('acces_refuse');
		expect(app().cheques.recus(lecteur).ok).toBe(true);
		expect(app().cheques.emis(lecteur).ok).toBe(true);
		expect(app().cheques.remises(lecteur).ok).toBe(true);
		expect(code(app().cheques.recus(compteur))).toBe('acces_refuse');
	});
});

describe('Remise', () => {
	it('Q2 : un Mouvement interne dont le montant égale ses chèques, avec son numéro', () => {
		const a = valeur(recu(100_00)).id;
		const b = valeur(recu(50_50)).id;
		const id = valeur(remettre([a, b], 150_50)).id;
		const remise = j().remises.find((r) => r.id === id)!;
		const op = j().operations.find((o) => o.id === remise.operationId)!;
		expect(remise.numero).toBe(1);
		expect(op).toMatchObject({ genre: 'interne', origine: 'remise', lignes: [] });
		expect(op.cotes.map((x) => [x.compteId, x.montant])).toEqual([
			[compteCheques, -150_50],
			[i.compteId, 150_50]
		]);
		expect(etat(a)).toBe('remis');
		expect(soldeCompte(j(), compteCheques, JOUR)).toBe(0);
		expect(soldeCompte(j(), i.compteId, JOUR)).toBe(1000_00 + 150_50);

		const c2 = valeur(recu(10_00)).id;
		const suivante = valeur(remettre([c2], 10_00)).id;
		expect(j().remises.find((r) => r.id === suivante)?.numero).toBe(2);
	});

	it('Q2 : refuse un total qui ne tombe pas juste, ou un chèque qui n’attend plus', () => {
		const a = valeur(recu(100_00)).id;
		expect(code(remettre([a], 90_00))).toBe('remise_desequilibree');
		valeur(remettre([a], 100_00));
		expect(code(remettre([a], 100_00))).toBe('remise_desequilibree');
		expect(code(remettre([], 0))).toBe('remise_vide');
	});

	it('refuse un Compte qui n’est ni banque ni épargne, ou une date avant la réception', () => {
		const a = valeur(recu(100_00)).id;
		expect(code(remettre([a], 100_00, JOUR, compteCheques))).toBe('remise_compte_invalide');
		expect(code(remettre([a], 100_00, '2026-10-01'))).toBe('remise_date_anterieure');
	});

	it('Q4 : annulée non pointée, elle libère ses chèques et garde son numéro', () => {
		const a = valeur(recu(100_00)).id;
		const id = valeur(remettre([a], 100_00)).id;
		valeur(app().cheques.annulerRemise(i.ctx(), id));
		expect(cheque(a).remiseId).toBeNull();
		expect(etat(a)).toBe('en_attente');
		expect(soldeCompte(j(), compteCheques, JOUR)).toBe(100_00);
		const nouvelle = valeur(remettre([a], 100_00)).id;
		expect(j().remises.find((r) => r.id === nouvelle)?.numero).toBe(2);
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('Q4 : pointée, elle ne s’annule pas', () => {
		const a = valeur(recu(100_00)).id;
		const id = valeur(remettre([a], 100_00)).id;
		pointer([coteEntree(id)], [ligneReleve(100_00, 'REMISE CHEQUES')]);
		expect(code(app().cheques.annulerRemise(i.ctx(), id))).toBe('cote_pointe');
		expect(etat(a)).toBe('pointe');
	});

	it('donne son bordereau, déjà calculé, sans vocabulaire comptable', async () => {
		const a = valeur(recu(100_00, { emetteur: 'Famille Une' })).id;
		const b = valeur(recu(50_00, { emetteur: 'Famille Deux' })).id;
		const id = valeur(remettre([a, b], 150_00)).id;
		const m = valeur(app().cheques.bordereau(i.ctx(), id));
		expect(m.titre).toBe('Bordereau de Remise n° 1');
		const t = m.sections[0]?.tableau;
		expect(t?.colonnes.map((x) => x.libelle)).toEqual(['Émetteur', 'Banque', 'Montant']);
		expect(t?.rangees.at(-1)?.cellules).toEqual(['Total', null, { montant: 150_00 }]);
		const pdf = await i.app.socle.exporteurs.pdf(m);
		expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
	});
});

describe('Pointage d’une Remise', () => {
	it('une Ligne égale propose la Remise avec ses chèques, présélectionnée', () => {
		const a = valeur(recu(100_00, { emetteur: 'Famille Une' })).id;
		const id = valeur(remettre([a], 100_00)).id;
		ligneReleve(100_00, 'REMISE CHEQUES 0000042');
		const page = valeur(app().pointage.page(i.ctx(), i.compteId, null));
		const p = page.lignes[0]?.propositions[0];
		expect(p?.preselection).toBe(true);
		expect(p?.raison).toBe('Même montant, Remise de 1 chèque');
		expect(p?.remise).toMatchObject({
			id,
			numero: 1,
			cheques: [{ emetteur: 'Famille Une', montant: 100_00 }]
		});
	});

	it('une scission de la banque se relie en un Pointage, consultable depuis chaque Remise', () => {
		const a = valeur(recu(2900_00)).id;
		const b = valeur(recu(100_00)).id;
		const r1 = valeur(remettre([a], 2900_00)).id;
		const r2 = valeur(remettre([b], 100_00)).id;
		const l1 = ligneReleve(2800_00, 'REMISE CHEQUES');
		const l2 = ligneReleve(200_00, 'REMISE CHEQUES SUITE');

		const page = valeur(app().pointage.page(i.ctx(), i.compteId, null));
		const proposees = page.lignes[0]?.propositions ?? [];
		expect(proposees.map((p) => p.remise?.numero)).toEqual([1, 2]);
		expect(proposees[0]?.preselection).toBe(false);

		// Une seule Remise en face des deux lignes : le total est contrôlé.
		expect(
			code(
				app().pointage.pointer(i.ctx(), {
					compteId: i.compteId,
					coteIds: [coteEntree(r1)],
					ligneIds: [l1, l2]
				})
			)
		).toBe('pointage_desequilibre');

		pointer([coteEntree(r1), coteEntree(r2)], [l1, l2]);
		for (const [id, autre] of [
			[r1, r2],
			[r2, r1]
		] as const) {
			const vue = valeur(app().cheques.remise(i.ctx(), id));
			expect(vue.etat).toBe('pointee');
			expect(vue.mouvements.map((m) => m.montant)).toEqual([2800_00, 200_00]);
			expect(vue.avec.map((x) => x.id)).toEqual([autre]);
			expect(vue.annulable).toBe(false);
		}
	});

	it('AD-11 : ses chèques passent à Pointé sans écriture, et reviennent au retrait', () => {
		const a = valeur(recu(100_00)).id;
		const id = valeur(remettre([a], 100_00)).id;
		const avant = JSON.stringify(cheque(a));
		const p = pointer([coteEntree(id)], [ligneReleve(100_00, 'REMISE')]);
		expect(etat(a)).toBe('pointe');
		expect(JSON.stringify(cheque(a))).toBe(avant);
		valeur(app().pointage.annuler(i.ctx(), p.id));
		expect(etat(a)).toBe('remis');
	});
});

describe('Rejet', () => {
	it('Q5 : d’un chèque remis, sur le Compte où il se trouve, Lignes opposées', () => {
		const a = valeur(recu(120_00, { lignes: [ligne(100_00), ligne(20_00, null)] })).id;
		valeur(remettre([a], 120_00));
		const rejet = valeur(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-20' }));
		const op = j().operations.find((o) => o.id === rejet.id)!;
		expect(op.origine).toBe('cheque_rejete');
		expect(op.cotes[0]).toMatchObject({ compteId: i.compteId, montant: -120_00 });
		expect(op.lignes.map((l) => [l.montant, l.estReduction])).toEqual([
			[-100_00, true],
			[-20_00, true]
		]);
		expect(etat(a)).toBe('rejete');
		expect(j().chequesRecus).toHaveLength(1);
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('Q5 : d’un chèque en attente, sur les chèques à remettre', () => {
		const a = valeur(recu(30_00)).id;
		valeur(app().cheques.rejeter(i.ctx(), { id: a, date: JOUR }));
		expect(soldeCompte(j(), compteCheques, JOUR)).toBe(0);
		expect(etat(a)).toBe('rejete');
		const b = valeur(recu(30_00)).id;
		expect(code(remettre([a, b], 60_00))).toBe('remise_desequilibree');
	});

	it('le résultat retombe : la recette est annulée, l’histoire reste', () => {
		const e = i.courant;
		const a = valeur(recu(100_00)).id;
		valeur(remettre([a], 100_00));
		expect(valeur(app().etats.compteDeResultat(i.ctx(), e)).resultat.recettes).toBe(100_00);
		valeur(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-20' }));
		const { resultat, anomalies } = valeur(app().etats.compteDeResultat(i.ctx(), e));
		expect(anomalies).toEqual([]);
		expect(resultat.recettes).toBe(0);
		expect(resultat.depenses).toBe(0);
		expect(resultat.resultat).toBe(0);
	});

	it('sa Ligne de relevé pointe son Côté, et le chèque reste Rejeté', () => {
		const a = valeur(recu(100_00)).id;
		valeur(remettre([a], 100_00));
		const rejet = valeur(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-20' }));
		const cote = j().operations.find((o) => o.id === rejet.id)!.cotes[0]!.id;
		const l = ligneReleve(-100_00, 'REJET CHEQUE', '2026-10-21');
		const page = valeur(app().pointage.page(i.ctx(), i.compteId, null));
		expect(page.lignes[0]?.propositions[0]?.coteId).toBe(cote);
		pointer([cote], [l]);
		expect(etat(a)).toBe('rejete');
	});

	it('refuse un second rejet, ou une date avant l’arrivée du chèque', () => {
		const a = valeur(recu(100_00)).id;
		valeur(remettre([a], 100_00, '2026-10-12'));
		const avant = app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-11' });
		expect(code(avant)).toBe('rejet_date_anterieure');
		valeur(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-13' }));
		expect(code(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-13' }))).toBe(
			'cheque_rejete'
		);
	});

	it('une Remise avec un rejet ne s’annule pas, sauf si le rejet s’annule d’abord', () => {
		const a = valeur(recu(100_00)).id;
		const id = valeur(remettre([a], 100_00)).id;
		valeur(app().cheques.rejeter(i.ctx(), { id: a, date: '2026-10-20' }));
		expect(code(app().cheques.annulerRemise(i.ctx(), id))).toBe('remise_avec_rejet');
		valeur(app().cheques.annulerRejet(i.ctx(), a));
		expect(etat(a)).toBe('remis');
		valeur(app().cheques.annulerRemise(i.ctx(), id));
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('O11 : reste possible si la Nature ou l’Action de l’origine a été désactivée', () => {
		const a = valeur(recu(100_00)).id;
		i.app.socle.depots.parametrage.activerAction(i.actionId, false);
		i.app.socle.depots.parametrage.activerNature(i.natureId, false);
		expect(app().cheques.rejeter(i.ctx(), { id: a, date: JOUR }).ok).toBe(true);
	});
});

describe('Rejet après clôture', () => {
	let f: InstanceFictive;
	let ctx: Ctx;

	function recuFictif(montant: Centimes) {
		const lignes = [
			{
				montant,
				contraire: false,
				reduction: false,
				natureId: f.reperes.nature('Transport'),
				actionId: f.reperes.action('Kermesse'),
				exerciceRattachementId: null,
				note: null
			}
		];
		return valeur(
			f.app.cheques.enregistrerRecu(ctx, {
				emetteur: 'Famille Imaginaire',
				banque: null,
				numero: null,
				date: '2027-06-10',
				montant,
				lignes
			})
		).id;
	}

	it('Q5 : s’enregistre dans l’Exercice ouvert, rattaché à celui de la recette', () => {
		f = instanceFictive('2027-10-15T10:00:00.000Z');
		ctx = f.ctx();
		const a = recuFictif(c(80_00));
		valeur(f.app.exercices.ouvrirSuivant(ctx));
		const e = f.exercice('2026-2027');
		valeur(f.app.exercices.cloturer(ctx, e.id));

		const rejet = valeur(f.app.cheques.rejeter(ctx, { id: a, date: '2027-06-20' }));
		const jour = f.app.socle.depots.operations.journal();
		const op = jour.operations.find((o) => o.id === rejet.id)!;
		const suivant = f.exercice('2027-2028');
		expect(op.date).toBe(suivant.debut);
		expect(op.lignes[0]?.exerciceRattachementId).toBe(e.id);
		const { resultat, anomalies } = valeur(f.app.etats.compteDeResultat(ctx, suivant));
		expect(anomalies).toEqual([]);
		expect(resultat.anterieurs.resultat).toBe(-80_00);
		expect(resultat.resultat).toBe(0);
		expect(valeur(f.app.etats.verifier(ctx))).toEqual([]);
	});
});

describe('Chèques émis', () => {
	const creer = (e: ReturnType<typeof sortie>) => app().operations.creer(i.ctx(), e);

	it('Q6 : le mode Chèque crée la ligne du registre dans la transaction de l’Opération', () => {
		const op = valeur(creer(sortie(50_00, '1000123'))).id;
		expect(j().chequesEmis).toEqual([
			expect.objectContaining({
				numero: '1000123',
				beneficiaire: 'Autocars imaginaires',
				operationId: op,
				annuleLe: null
			})
		]);
		const vue = valeur(app().cheques.emis(i.ctx()));
		expect(vue.rangees[0]).toMatchObject({
			numero: '1000123',
			montant: 50_00,
			etat: 'emis'
		});
	});

	it('demande le n° et le bénéficiaire', () => {
		expect(code(creer(sortie(50_00, null)))).toBe('numero_cheque_requis');
		const sansBeneficiaire = creer(sortie(50_00, '1000123', { tiers: null }));
		expect(code(sansBeneficiaire)).toBe('champ_requis');
		expect(j().operations).toHaveLength(0);
	});

	it('refuse un n° déjà utilisé, même écrit autrement, et ne garde rien', () => {
		valeur(creer(sortie(50_00, '1000123')));
		const r = creer(sortie(20_00, '01000123'));
		expect(code(r)).toBe('numero_cheque_utilise');
		expect(j().operations).toHaveLength(1);
	});

	it('une Recette par chèque n’entre pas au registre des émis', () => {
		valeur(creer(i.saisie('recette', 20_00, { modePaiement: 'cheque', reference: '77777' })));
		expect(j().chequesEmis).toHaveLength(0);
	});

	it('Q6 : annulée, l’Opération laisse sa ligne, état Annulé', () => {
		const op = valeur(creer(sortie(50_00, '1000123'))).id;
		valeur(app().operations.annuler(i.ctx(), op));
		const vue = valeur(app().cheques.emis(i.ctx()));
		expect(vue.rangees[0]).toMatchObject({ numero: '1000123', etat: 'annule', montant: 50_00 });
		expect(valeur(app().etats.verifier(i.ctx()))).toEqual([]);
	});

	it('la formule d’un paiement annulé se reprend pour le paiement corrigé', () => {
		const op = valeur(creer(sortie(50_00, '1000123'))).id;
		valeur(app().operations.annuler(i.ctx(), op));
		const nouvelle = valeur(creer(sortie(55_00, '1000123'))).id;
		expect(j().chequesEmis).toEqual([
			expect.objectContaining({ numero: '1000123', operationId: nouvelle, annuleLe: null })
		]);
	});

	it('une formule annulée sans paiement reste au registre, et son n° ne resservira pas', () => {
		valeur(app().cheques.annulerFormule(i.ctx(), { numero: '1000124', beneficiaire: null }));
		expect(j().chequesEmis[0]).toMatchObject({ operationId: null, numero: '1000124' });
		expect(j().chequesEmis[0]?.annuleLe).not.toBeNull();
		expect(code(creer(sortie(50_00, '1000124')))).toBe('numero_cheque_utilise');
		const vue = valeur(app().cheques.emis(i.ctx()));
		expect(vue.rangees[0]).toMatchObject({ etat: 'annule', montant: null });
		expect(
			code(app().cheques.annulerFormule(i.ctx(), { numero: '1000124', beneficiaire: null }))
		).toBe('numero_cheque_utilise');
	});

	it('Pointé se déduit du Pointage', () => {
		const op = valeur(creer(sortie(50_00, '1000123'))).id;
		const cote = j().operations.find((o) => o.id === op)!.cotes[0]!.id;
		pointer([cote], [ligneReleve(-50_00, 'CHEQUE 1000123')]);
		expect(valeur(app().cheques.emis(i.ctx())).rangees[0]?.etat).toBe('pointe');
	});

	it('une correction suit au registre : n°, bénéficiaire, ou retrait si ce n’est plus un chèque', () => {
		const op = valeur(creer(sortie(50_00, '1000123')));
		const modifier = (saisie: ReturnType<typeof sortie>) => {
			const version = j().operations.find((o) => o.id === op.id)!.version;
			return app().operations.modifier(i.ctx(), { id: op.id, version, saisie });
		};
		valeur(modifier(sortie(50_00, '1000999', { tiers: 'Autre' })));
		expect(j().chequesEmis[0]).toMatchObject({ numero: '1000999', beneficiaire: 'Autre' });

		valeur(creer(sortie(20_00, '1000200')));
		expect(code(modifier(sortie(50_00, '1000200')))).toBe('numero_cheque_utilise');

		valeur(modifier(sortie(50_00, null, { modePaiement: 'virement', tiers: null })));
		expect(j().chequesEmis.map((x) => x.numero)).toEqual(['1000200']);
	});

	it('un paiement du jalon 1, porté par sa référence, compte au registre et se modifie', () => {
		// Écrit tel que le jalon 1 l'écrivait : Opération seule, sans ligne au registre.
		const op = valeur(creer(sortie(50_00, '1000123'))).id;
		i.base.prepare('DELETE FROM cheque_emis').run();
		expect(code(creer(sortie(20_00, '1000123')))).toBe('numero_cheque_utilise');
		const vue = valeur(app().cheques.emis(i.ctx()));
		expect(vue.rangees[0]).toMatchObject({ id: null, numero: '1000123', etat: 'emis' });
		const version = j().operations.find((o) => o.id === op)!.version;
		valeur(
			app().operations.modifier(i.ctx(), { id: op, version, saisie: sortie(50_00, '1000123') })
		);
		expect(j().chequesEmis).toHaveLength(1);
	});
});

describe('Chèque absent du registre', () => {
	it('une sortie au relevé qui porte un n° inconnu se signale, puis disparaît une fois inscrit', () => {
		ligneReleve(-50_00, 'CHEQUE N 1000123');
		const lignes = () => valeur(app().pointage.page(i.ctx(), i.compteId, null)).lignes;
		expect(lignes()[0]?.chequeAbsent).toBe('1000123');
		expect(valeur(app().cheques.emis(i.ctx())).manquants).toEqual([
			expect.objectContaining({ numero: '1000123', montant: -50_00 })
		]);
		const tableau = () => valeur(app().etats.tableau(i.ctx(), i.courant));
		expect(tableau().taches.find((t) => t.id === 'cheques_absents')?.compteur).toBe(1);

		valeur(app().operations.creer(i.ctx(), sortie(50_00, '1000123')));
		expect(lignes()[0]?.chequeAbsent).toBeNull();
		expect(valeur(app().cheques.emis(i.ctx())).manquants).toEqual([]);
		expect(tableau().taches.find((t) => t.id === 'cheques_absents')).toBeUndefined();
	});

	it('un paiement du jalon 1 dont la référence porte ce n° compte comme inscrit', () => {
		valeur(app().operations.creer(i.ctx(), sortie(50_00, '1000123')));
		i.base.prepare('DELETE FROM cheque_emis').run();
		ligneReleve(-50_00, 'CHEQUE 1000123');
		const page = valeur(app().pointage.page(i.ctx(), i.compteId, null));
		expect(page.lignes[0]?.chequeAbsent).toBeNull();
	});

	it('une entrée ou une ligne pointée ne se signale pas', () => {
		ligneReleve(150_00, 'REMISE CHEQUE 12345');
		const dep = valeur(app().operations.creer(i.ctx(), i.saisie('depense', 40_00)));
		const cote = j().operations.find((o) => o.id === dep.id)!.cotes[0]!.id;
		pointer([cote], [ligneReleve(-40_00, 'CHEQUE 54321')]);
		expect(valeur(app().cheques.emis(i.ctx())).manquants).toEqual([]);
	});

	it('créer l’Opération depuis la ligne reprend le n° et remplit le registre', () => {
		const l = ligneReleve(-50_00, 'CHEQUE 1000123');
		const a = valeur(app().pointage.ligneASaisir(i.ctx(), l));
		expect(a.chequeLu).toBe('1000123');
		valeur(
			app().pointage.creerDepuisLigne(i.ctx(), {
				ligneId: l,
				saisie: sortie(50_00, '1000123', { date: JOUR })
			})
		);
		expect(j().chequesEmis).toHaveLength(1);
		expect(valeur(app().cheques.emis(i.ctx())).rangees[0]?.etat).toBe('pointe');
	});
});

describe('Versement SumUp', () => {
	function versement(l: number) {
		return i.saisie('recette', 95_00, {
			libelle: 'VIREMENT SUMUP',
			date: JOUR,
			modePaiement: 'sumup',
			lignes: [ligne(100_00), { ...ligne(5_00), contraire: true, actionId: null }],
			...(l === 0 ? {} : { montant: c(l) })
		});
	}

	it('FR-24 : un Côté net, une Ligne + brut, une Ligne − frais, et le Pointage à l’enregistrement', () => {
		const l = ligneReleve(95_00, 'VIREMENT SUMUP PAYOUT');
		const a = valeur(app().pointage.ligneASaisir(i.ctx(), l));
		expect(a.sumup).not.toBeNull();
		const page = valeur(app().pointage.page(i.ctx(), i.compteId, null));
		expect(page.lignes[0]?.sumup).toBe(true);

		const r = valeur(
			app().pointage.creerDepuisLigne(i.ctx(), { ligneId: l, saisie: versement(0) })
		);
		const op = j().operations.find((o) => o.id === r.id)!;
		expect(op.cotes[0]?.montant).toBe(95_00);
		expect(op.lignes.map((x) => [x.montant, x.estReduction])).toEqual([
			[100_00, false],
			[-5_00, false]
		]);
		expect(op.modePaiement).toBe('sumup');
		expect(op.sansPiece).toBe(true);
		expect(r.pointageId).not.toBeNull();

		const { resultat } = valeur(app().etats.compteDeResultat(i.ctx(), i.courant));
		expect(resultat.recettes).toBe(100_00);
		expect(resultat.depenses).toBe(5_00);
		expect(
			valeur(app().etats.tableau(i.ctx(), i.courant)).taches.find((t) => t.id === 'pieces')
		).toMatchObject({ compteur: 0 });
	});

	it('O1 : un net qui ne tombe pas juste ne s’enregistre pas, et rien n’est pointé', () => {
		const l = ligneReleve(94_00, 'VIREMENT SUMUP');
		const r = app().pointage.creerDepuisLigne(i.ctx(), { ligneId: l, saisie: versement(94_00) });
		expect(code(r)).toBe('ventilation_incomplete');
		expect(j().pointages).toHaveLength(0);
	});

	it('un versement suivant reprend les Natures du précédent', () => {
		const l = ligneReleve(95_00, 'VIREMENT SUMUP');
		valeur(app().pointage.creerDepuisLigne(i.ctx(), { ligneId: l, saisie: versement(0) }));
		const suivante = ligneReleve(10_00, 'SUMUP PAYOUT 2', '2026-10-11');
		expect(valeur(app().pointage.ligneASaisir(i.ctx(), suivante)).sumup).toEqual({
			natureBrutId: i.natureId,
			actionBrutId: i.actionId,
			natureFraisId: i.natureId,
			actionFraisId: null
		});
	});
});
