import { describe, expect, it } from 'vitest';
import {
	brouillonRejet,
	chequesEnAttente,
	compteDuCheque,
	deciderModificationCheque,
	deciderRejet,
	estPaiementCheque,
	etatChequeEmis,
	etatChequeRecu,
	etatRemise,
	memeNumero,
	numeroInscrit,
	numeroReutilisable,
	sansZeros,
	totalEnAttente
} from '#lib/domaine/cheques/index.ts';
import { violationsCheques } from '#lib/domaine/cheques/verification.ts';
import {
	vueEmis,
	vueRecus,
	vueNouvelleRemise,
	vueRemise,
	vueRemises
} from '#lib/domaine/cheques/vues.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import { journalVide, type GrandJournal, type OperationJ } from '#lib/domaine/journal.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import { formeStandard } from '#lib/domaine/operations/formes.ts';
import type { Compte } from '#lib/domaine/parametrage.ts';
import { chequeAbsent, chequesAbsents, sumupPrecedent } from '#lib/domaine/releve/cheques.ts';
import { estVersementSumup, numeroChequeLu } from '#lib/domaine/releve/references.ts';

const compte = (id: number, type: Compte['type'], libelle = `Compte ${id}`): Compte =>
	({ id, libelle, type, ordre: id, actif: true, reserve: false }) as Compte;

const CHEQUES = 9;
const BANQUE = 1;

function op(partiel: Partial<OperationJ> & { id: number; montant: number }): OperationJ {
	const { montant, ...reste } = partiel;
	const date = reste.date ?? '2026-10-01';
	return {
		genre: 'standard',
		origine: 'cheque_recu',
		date,
		libelle: 'Chèque',
		reference: null,
		modePaiement: 'cheque',
		note: null,
		tiers: null,
		liaisonId: null,
		sansPiece: true,
		version: 1,
		creeLe: `${date}T10:00:00.000Z`,
		annuleeLe: null,
		cotes: [
			{ id: reste.id * 10, operationId: reste.id, compteId: CHEQUES, date, montant: c(montant) }
		],
		lignes: [
			{
				id: reste.id * 10,
				operationId: reste.id,
				ordre: 1,
				montant: c(montant),
				estReduction: false,
				natureId: 1,
				actionId: 1,
				exerciceRattachementId: 1,
				note: null
			}
		],
		pieces: [],
		...reste
	};
}

function remiseOp(id: number, montant: number, date: string): OperationJ {
	return op({
		id,
		montant,
		date,
		genre: 'interne',
		origine: 'remise',
		lignes: [],
		cotes: [
			{ id: id * 10, operationId: id, compteId: CHEQUES, date, montant: c(-montant) },
			{ id: id * 10 + 1, operationId: id, compteId: BANQUE, date, montant: c(montant) }
		]
	});
}

const journal = (partiel: Partial<GrandJournal>): GrandJournal => ({
	...journalVide(),
	comptes: [compte(BANQUE, 'banque'), compte(CHEQUES, 'cheques_a_remettre')],
	...partiel
});

const cheque = (id: number, partiel = {}) => ({
	id,
	operationId: id,
	emetteur: `Famille ${id}`,
	banque: null,
	numero: null,
	dateCheque: null,
	remiseId: null,
	operationRejetId: null,
	...partiel
});

/** Trois chèques : un remis et pointé, un rejeté en attente, un en attente. */
function complet() {
	return journal({
		operations: [
			op({ id: 1, montant: 100_00 }),
			op({ id: 2, montant: 30_00 }),
			op({ id: 3, montant: 50_00 }),
			remiseOp(4, 100_00, '2026-10-05'),
			op({
				id: 5,
				montant: -30_00,
				origine: 'cheque_rejete',
				date: '2026-10-06',
				lignes: [{ ...op({ id: 5, montant: -30_00 }).lignes[0]!, estReduction: true }]
			})
		],
		remises: [{ id: 1, numero: 1, operationId: 4 }],
		chequesRecus: [cheque(1, { remiseId: 1 }), cheque(2, { operationRejetId: 5 }), cheque(3)],
		pointages: [{ id: 1, compteId: BANQUE, coteIds: [41], ligneReleveIds: [1] }]
	});
}

describe('états déduits (AD-11)', () => {
	it('rejeté, pointé, remis, sinon en attente', () => {
		const j = complet();
		const [a, b, d] = j.chequesRecus as [
			GrandJournal['chequesRecus'][number],
			GrandJournal['chequesRecus'][number],
			GrandJournal['chequesRecus'][number]
		];
		expect(etatChequeRecu(j, a)).toBe('pointe');
		expect(etatChequeRecu(j, b)).toBe('rejete');
		expect(etatChequeRecu(j, d)).toBe('en_attente');
		expect(etatChequeRecu({ ...j, pointages: [] }, a)).toBe('remis');
		expect(chequesEnAttente(j)).toEqual([d]);
		expect(compteDuCheque(j, a)).toBe(BANQUE);
		expect(compteDuCheque(j, d)).toBe(CHEQUES);
	});

	it('Remise : annulée, déposée ou pointée', () => {
		const j = complet();
		const r = j.remises[0]!;
		expect(etatRemise(j, r)).toBe('pointee');
		expect(etatRemise({ ...j, pointages: [] }, r)).toBe('remise');
		const annulee = { ...remiseOp(4, 100_00, '2026-10-05'), annuleeLe: '2026-10-06T10:00:00.000Z' };
		expect(
			etatRemise({ ...j, operations: [], operationsAnnulees: [annulee], pointages: [] }, r)
		).toBe('annulee');
		expect(etatRemise({ ...j, operations: [] }, r)).toBe('annulee');
	});

	it('Q3 : ce qui attend à une date, ni avant, ni après', () => {
		const j = complet();
		expect(totalEnAttente(j, '2026-09-30')).toBe(0);
		expect(totalEnAttente(j, '2026-10-01')).toBe(180_00);
		expect(totalEnAttente(j, '2026-10-05')).toBe(80_00);
		expect(totalEnAttente(j, '2026-10-06')).toBe(50_00);
	});

	it('chèque émis : annulé, pointé, sinon émis', () => {
		const paiement = op({ id: 7, montant: -50_00, origine: 'saisie' });
		const j = journal({ operations: [paiement] });
		const e = { operationId: 7, annuleLe: null };
		expect(etatChequeEmis(j, e)).toBe('emis');
		expect(
			etatChequeEmis(
				{ ...j, pointages: [{ id: 1, compteId: 1, coteIds: [70], ligneReleveIds: [] }] },
				e
			)
		).toBe('pointe');
		expect(etatChequeEmis(j, { ...e, annuleLe: '2026-10-06T10:00:00.000Z' })).toBe('annule');
	});
});

describe('décisions', () => {
	const ouvert = {
		id: 2,
		statut: 'ouvert',
		debut: '2026-09-01',
		fin: '2027-08-31',
		anneeDebut: 2026,
		libelle: '2026-2027'
	} as Exercice;

	it('Q4 : refuse la modification d’un chèque remis ou rejeté', () => {
		const j = complet();
		const [a, b, d] = j.chequesRecus;
		expect(deciderModificationCheque(j, a!)).toEqual({
			ok: false,
			erreur: { code: 'cheque_remis' }
		});
		expect(deciderModificationCheque(j, b!)).toEqual({
			ok: false,
			erreur: { code: 'cheque_rejete' }
		});
		expect(deciderModificationCheque(j, d!).ok).toBe(true);
	});

	it('Q5 : le rejet porte sur le Compte du chèque, Lignes opposées en réduction', () => {
		const j = complet();
		const d = j.chequesRecus[2]!;
		const r = deciderRejet(j, [ouvert], d, '2026-10-10');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.valeur.compteId).toBe(CHEQUES);
		const b = brouillonRejet(d, r.valeur);
		expect(b.cotes[0]?.montant).toBe(-50_00);
		expect(b.lignes[0]).toMatchObject({ montant: -50_00, estReduction: true });
		expect(b.origine).toBe('cheque_rejete');
	});

	it('hors de tout Exercice, ou Opération disparue : le rejet est refusé', () => {
		const j = complet();
		const d = j.chequesRecus[2]!;
		expect(deciderRejet(j, [], d, '2026-10-10').ok).toBe(false);
		expect(deciderRejet({ ...j, operations: [] }, [ouvert], d, '2026-10-10').ok).toBe(false);
	});

	it('Saisie d’un versement SumUp : dispensé de Pièce, pas une dépense de frais seuls', () => {
		const base = {
			libelle: 'SumUp',
			reference: null,
			note: null,
			tiers: null,
			compteId: 1,
			date: '2026-10-10',
			montant: c(10_00),
			lignes: []
		};
		const recette = formeStandard({ ...base, intention: 'recette', modePaiement: 'sumup' });
		expect(recette.sansPiece).toBe(true);
		const depense = formeStandard({ ...base, intention: 'depense', modePaiement: 'sumup' });
		expect(depense.sansPiece).toBe(false);
		expect(formeStandard({ ...base, intention: 'recette', modePaiement: null }).sansPiece).toBe(
			false
		);
	});

	it('un chèque émis est une sortie saisie, de mode Chèque', () => {
		const cotes = [{ compteId: 1, date: '2026-10-10', montant: c(-1) }];
		expect(estPaiementCheque({ origine: 'saisie', modePaiement: 'cheque', cotes })).toBe(true);
		expect(estPaiementCheque({ origine: 'saisie', modePaiement: 'virement', cotes })).toBe(false);
		expect(estPaiementCheque({ origine: 'remise', modePaiement: 'cheque', cotes })).toBe(false);
		expect(estPaiementCheque({ origine: 'saisie', modePaiement: 'cheque', cotes: [] })).toBe(false);
	});

	it('une formule ne se reprend qu’après un paiement annulé', () => {
		const j = journal({ operations: [op({ id: 7, montant: -1, origine: 'saisie' })] });
		const le = '2026-10-06T10:00:00.000Z';
		expect(numeroReutilisable(j, { operationId: 8, annuleLe: le })).toBe(true);
		expect(numeroReutilisable(j, { operationId: 7, annuleLe: le })).toBe(false);
		expect(numeroReutilisable(j, { operationId: null, annuleLe: le })).toBe(false);
	});
});

describe('lecture d’un n° de chèque', () => {
	it.each([
		['CHEQUE 1234567', '1234567'],
		['CHEQUE N° 0001234', '0001234'],
		['Chèque n°1234567 emis', '1234567'],
		['CHQ 123456', '123456'],
		['CHEQ. N 123456', '123456'],
		['CHEQUE NUMERO 123456', '123456']
	])('%s donne %s', (libelle, numero) => {
		expect(numeroChequeLu(libelle)).toBe(numero);
	});

	it.each(['REMISE CHEQUES', 'VIREMENT 123456', 'CHEQUE', 'CHEQUE 12', 'ECHEQUE 123456'])(
		'%s ne donne rien',
		(libelle) => {
			expect(numeroChequeLu(libelle)).toBeNull();
		}
	);

	it('compare les n° sans les zéros de tête', () => {
		expect(sansZeros(' 00123 ')).toBe('123');
		expect(sansZeros('0')).toBe('0');
		expect(memeNumero('00123', '123')).toBe(true);
		expect(memeNumero('124', '123')).toBe(false);
	});

	it('signale une sortie inconnue, pas une entrée ni un n° inscrit', () => {
		const j = journal({
			chequesEmis: [
				{ id: 1, numero: '00555', beneficiaire: 'X', operationId: null, annuleLe: 'x' }
			],
			operations: [op({ id: 7, montant: -1, origine: 'saisie', reference: '666' })]
		});
		expect(chequeAbsent(j, { libelle: 'CHEQUE 777', montant: c(-1) })).toBe('777');
		expect(chequeAbsent(j, { libelle: 'CHEQUE 777', montant: c(1) })).toBeNull();
		expect(chequeAbsent(j, { libelle: 'CHEQUE 555', montant: c(-1) })).toBeNull();
		expect(chequeAbsent(j, { libelle: 'CHEQUE 666', montant: c(-1) })).toBeNull();
		expect(numeroInscrit(j, '555')).toBe(true);
	});

	it('ne remonte que le relevé jusqu’à la fin demandée', () => {
		const ligne = (id: number, date: string) => ({
			id,
			compteId: 1,
			date,
			montant: c(-1),
			libelle: `CHEQUE 77${id}`,
			doublon: 'non' as const,
			importId: null,
			identifiantSource: null,
			empreinte: String(id)
		});
		const j = journal({ lignesReleve: [ligne(1, '2026-10-01'), ligne(2, '2027-10-01')] });
		expect(chequesAbsents(j).map((a) => a.numero)).toEqual(['771', '772']);
		expect(chequesAbsents(j, '2027-08-31').map((a) => a.numero)).toEqual(['771']);
	});
});

describe('SumUp', () => {
	it('reconnaît un versement, pas une sortie', () => {
		expect(estVersementSumup({ libelle: 'VIR SUMUP PAYOUT', montant: 1 })).toBe(true);
		expect(estVersementSumup({ libelle: 'Sum Up 123', montant: 1 })).toBe(true);
		expect(estVersementSumup({ libelle: 'SUMUP', montant: -1 })).toBe(false);
		expect(estVersementSumup({ libelle: 'SOMMET', montant: 1 })).toBe(false);
	});

	it('sans versement précédent, rien à reprendre', () => {
		expect(sumupPrecedent({ operations: [] })).toEqual({
			natureBrutId: null,
			actionBrutId: null,
			natureFraisId: null,
			actionFraisId: null
		});
	});
});

describe('ape verifier : Q1 à Q6', () => {
	const invariants = (j: GrandJournal) => violationsCheques(j).map((v) => v.invariant);

	it('un journal juste ne signale rien, un journal sans Compte des chèques non plus', () => {
		expect(violationsCheques(complet())).toEqual([]);
		expect(violationsCheques(journal({ comptes: [] }))).toEqual([]);
	});

	it('Q1 : Opération de mauvaise forme', () => {
		const j = complet();
		const mauvaise = op({ id: 3, montant: 50_00, origine: 'saisie' });
		expect(
			invariants({ ...j, operations: j.operations.map((o) => (o.id === 3 ? mauvaise : o)) })
		).toContain('Q1');
	});

	it('Q2 : montant qui ne suit pas ses chèques', () => {
		const j = complet();
		const operations = j.operations.map((o) => (o.id === 4 ? remiseOp(4, 90_00, '2026-10-05') : o));
		expect(invariants({ ...j, operations })).toContain('Q2');
	});

	it('Q3 : un Côté de plus sur le Compte', () => {
		const j = complet();
		expect(
			invariants({ ...j, operations: [...j.operations, op({ id: 8, montant: 1_00 })] })
		).toContain('Q3');
	});

	it('Q4 : Remise inconnue ou annulée', () => {
		const j = complet();
		expect(
			invariants({ ...j, chequesRecus: [...j.chequesRecus, cheque(3, { remiseId: 99 })] })
		).toContain('Q4');
		const annulee = { ...remiseOp(4, 100_00, '2026-10-05'), annuleeLe: 'x' };
		expect(
			invariants({
				...j,
				operations: j.operations.filter((o) => o.id !== 4),
				operationsAnnulees: [annulee],
				pointages: []
			})
		).toContain('Q4');
	});

	it('Q5 : rejet sans réduction, ou sur un autre Compte', () => {
		const j = complet();
		const operations = j.operations.map((o) =>
			o.id === 5 ? op({ id: 5, montant: -30_00, origine: 'cheque_rejete' }) : o
		);
		expect(invariants({ ...j, operations })).toContain('Q5');
	});

	it('Q6 : le registre ne suit pas son Opération', () => {
		const j = complet();
		const emis = { id: 1, numero: '1', beneficiaire: 'X' };
		expect(
			invariants({ ...j, chequesEmis: [{ ...emis, operationId: 99, annuleLe: null }] })
		).toContain('Q6');
		expect(
			invariants({ ...j, chequesEmis: [{ ...emis, operationId: 1, annuleLe: 'x' }] })
		).toContain('Q6');
		expect(
			invariants({ ...j, chequesEmis: [{ ...emis, operationId: null, annuleLe: 'x' }] })
		).not.toContain('Q6');
	});
});

describe('vues', () => {
	const noms = {
		actions: [{ id: 1, libelle: 'Agrumes' }],
		comptes: [
			compte(BANQUE, 'banque', 'CCP'),
			compte(2, 'epargne', 'Livret'),
			compte(CHEQUES, 'cheques_a_remettre', 'Chèques')
		]
	} as never;

	it('Reçus : compteurs, total à remettre, Nature par Action, banques', () => {
		const j = complet();
		j.chequesRecus[0]!.banque = 'Banque Fictive';
		const v = vueRecus(j, noms);
		expect(v.compteurs).toEqual({ en_attente: 1, remis: 0, pointe: 1, rejete: 1 });
		expect(v.totalAttente).toBe(50_00);
		expect(v.natureParAction).toEqual({ 1: 1 });
		expect(v.banques).toEqual(['Banque Fictive']);
		expect(v.rangees[0]?.actions).toEqual(['Agrumes']);
	});

	it('Remises : la plus récente d’abord, avec ses chèques et sa répartition', () => {
		const j = {
			...complet(),
			lignesReleve: [
				{
					id: 1,
					compteId: BANQUE,
					date: '2026-10-08',
					montant: c(100_00),
					libelle: 'REMISE',
					doublon: 'non' as const,
					importId: null,
					identifiantSource: null,
					empreinte: 'x'
				}
			]
		};
		const v = vueRemises(j, noms);
		expect(v.rangees[0]).toMatchObject({ numero: 1, compte: 'CCP', nombre: 1, etat: 'pointee' });
		expect(v.compteurs).toEqual({ remise: 0, pointee: 1, annulee: 0 });
		expect(v.enAttente).toBe(1);
		const d = vueRemise(j, j.remises[0]!, noms);
		expect(d.mouvements).toEqual([expect.objectContaining({ libelle: 'REMISE' })]);
		expect(d.avec).toEqual([]);
		expect(d.annulable).toBe(false);
	});

	it('Nouvelle Remise : banques et livrets, la dernière destination d’abord', () => {
		const v = vueNouvelleRemise(complet(), noms);
		expect(v.comptes.map((x) => x.libelle)).toEqual(['CCP', 'Livret']);
		expect(v.compteId).toBe(BANQUE);
		expect(v.cheques.map((x) => x.emetteur)).toEqual(['Famille 3']);
		const sansRemise = vueNouvelleRemise(journal({}), {
			...(noms as object),
			comptes: [compte(2, 'epargne', 'Livret')]
		} as never);
		expect(sansRemise.compteId).toBe(2);
	});

	it('Émis : registre et paiements du jalon 1, du plus récent au plus ancien', () => {
		const ancien = op({
			id: 7,
			montant: -40_00,
			origine: 'saisie',
			reference: '111',
			tiers: 'Ancien',
			date: '2026-09-15'
		});
		const nouveau = op({ id: 8, montant: -60_00, origine: 'saisie', date: '2026-10-15' });
		const j = journal({
			operations: [ancien, nouveau],
			chequesEmis: [
				{ id: 1, numero: '222', beneficiaire: 'Nouveau', operationId: 8, annuleLe: null },
				{ id: 2, numero: '223', beneficiaire: 'Formule', operationId: null, annuleLe: 'x' }
			]
		});
		const v = vueEmis(j, noms);
		expect(v.rangees.map((r) => r.numero)).toEqual(['222', '111', '223']);
		expect(v.rangees[1]).toMatchObject({ id: null, beneficiaire: 'Ancien', montant: 40_00 });
		expect(v.compteurs).toEqual({ emis: 2, pointe: 0, annule: 1 });
	});
});
