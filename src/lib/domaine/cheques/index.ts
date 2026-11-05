/**
 * Chèques à états déduits (AD-11, FR-21 à FR-23, Q1 à Q6). Aucun statut n'est stocké :
 * tout se lit dans le grand journal, à la Remise, au rejet et au Pointage.
 */
import type { DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type {
	ChequeEmisJ,
	ChequeRecuJ,
	CoteJ,
	GrandJournal,
	OperationJ,
	RemiseJ
} from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import { ligneDeSaisie, type LigneVentilee } from '../operations/formes.ts';
import type { Brouillon } from '../operations/validation.ts';
import type { Compte } from '../parametrage.ts';
import { dateDepuisLigne } from '../releve/pointage.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

export const ETATS_CHEQUE_RECU = ['en_attente', 'remis', 'pointe', 'rejete'] as const;
export type EtatChequeRecu = (typeof ETATS_CHEQUE_RECU)[number];

export const LIBELLES_ETAT_RECU: Record<EtatChequeRecu, string> = {
	en_attente: 'En attente',
	remis: 'Remis',
	pointe: 'Pointé',
	rejete: 'Rejeté'
};

export const ETATS_CHEQUE_EMIS = ['emis', 'pointe', 'annule'] as const;
export type EtatChequeEmis = (typeof ETATS_CHEQUE_EMIS)[number];

export const LIBELLES_ETAT_EMIS: Record<EtatChequeEmis, string> = {
	emis: 'Émis',
	pointe: 'Pointé',
	annule: 'Annulé'
};

export type EtatRemise = 'remise' | 'pointee' | 'annulee';

export const LIBELLES_ETAT_REMISE: Record<EtatRemise, string> = {
	remise: 'Déposée',
	pointee: 'Pointée',
	annulee: 'Annulée'
};

type JournalOperations = Pick<GrandJournal, 'operations' | 'operationsAnnulees'>;
type JournalCheques = JournalOperations &
	Pick<GrandJournal, 'pointages' | 'remises' | 'chequesRecus'>;

/** Index par tableau : Q3 relit chaque chèque à chaque date, sur dix ans de données. */
const INDEX = new WeakMap<readonly OperationJ[], Map<number, OperationJ>>();

function indexDe(operations: readonly OperationJ[]) {
	const connu = INDEX.get(operations);
	if (connu) return connu;
	const index = new Map(operations.map((o) => [o.id, o]));
	INDEX.set(operations, index);
	return index;
}

function operationDe(j: JournalOperations, id: number | null): OperationJ | undefined {
	if (id === null) return undefined;
	return indexDe(j.operations).get(id) ?? indexDe(j.operationsAnnulees).get(id);
}

/** Le Côté d'une Opération qui entre sur un Compte. */
const entree = (op: Pick<OperationJ, 'cotes'> | undefined): CoteJ | undefined =>
	op?.cotes.find((c) => c.montant > 0);

const pointe = (j: Pick<GrandJournal, 'pointages'>, id: number | undefined) =>
	id !== undefined && j.pointages.some((p) => p.coteIds.includes(id));

export function compteCheques(j: Pick<GrandJournal, 'comptes'>): Compte | undefined {
	return j.comptes.find((c) => c.type === 'cheques_a_remettre');
}

export function montantRecu(j: JournalOperations, c: Pick<ChequeRecuJ, 'operationId'>): Centimes {
	return entree(operationDe(j, c.operationId))?.montant ?? centimes(0);
}

export function remiseDe(
	j: Pick<GrandJournal, 'remises'>,
	c: Pick<ChequeRecuJ, 'remiseId'>
): RemiseJ | undefined {
	return j.remises.find((r) => r.id === c.remiseId);
}

/** Rejeté, sinon pointé si le Côté d'entrée de sa Remise l'est, sinon remis, sinon en attente. */
export function etatChequeRecu(j: JournalCheques, c: ChequeRecuJ): EtatChequeRecu {
	if (c.operationRejetId !== null) return 'rejete';
	const remise = remiseDe(j, c);
	if (remise === undefined) return 'en_attente';
	return pointe(j, entree(operationDe(j, remise.operationId))?.id) ? 'pointe' : 'remis';
}

export function chequesEnAttente(j: JournalCheques): ChequeRecuJ[] {
	return j.chequesRecus.filter((c) => etatChequeRecu(j, c) === 'en_attente');
}

/** Le Compte où se trouve le chèque : celui des chèques à remettre, ou celui de sa Remise (Q5). */
export function compteDuCheque(j: JournalCheques, c: ChequeRecuJ): number | undefined {
	const remise = remiseDe(j, c);
	const op = operationDe(j, remise?.operationId ?? c.operationId);
	return entree(op)?.compteId;
}

/** Date à laquelle le chèque arrive sur son Compte : un rejet ne la précède pas. */
function arriveeDuCheque(j: JournalCheques, c: ChequeRecuJ): DateCivile | undefined {
	const remise = remiseDe(j, c);
	return entree(operationDe(j, remise?.operationId ?? c.operationId))?.date;
}

/** Sorti des chèques à remettre : remis, ou rejeté avant d'avoir été remis, ce jour-là au plus tard. */
function sortiLe(j: JournalCheques, c: ChequeRecuJ, d: DateCivile): boolean {
	const remise = remiseDe(j, c);
	if (remise) return (operationDe(j, remise.operationId)?.date ?? d) <= d;
	return (operationDe(j, c.operationRejetId)?.date ?? '9999-12-31') <= d;
}

/** Q3 : ce que le solde de `cheques_a_remettre` doit valoir à cette date. */
export function totalEnAttente(j: JournalCheques, d: DateCivile): Centimes {
	return sommeCentimes(
		j.chequesRecus
			.filter((c) => (operationDe(j, c.operationId)?.date ?? d) <= d && !sortiLe(j, c, d))
			.map((c) => montantRecu(j, c))
	);
}

export type RemiseVue = { cheques: ChequeRecuJ[]; total: Centimes };

export function chequesDeRemise(j: JournalCheques, remiseId: number): RemiseVue {
	const cheques = j.chequesRecus.filter((c) => c.remiseId === remiseId);
	return { cheques, total: sommeCentimes(cheques.map((c) => montantRecu(j, c))) };
}

export function etatRemise(j: JournalCheques, r: RemiseJ): EtatRemise {
	const op = operationDe(j, r.operationId);
	if (op === undefined || op.annuleeLe !== null) return 'annulee';
	return pointe(j, entree(op)?.id) ? 'pointee' : 'remise';
}

export type SaisieChequeRecu = {
	emetteur: string;
	banque: string | null;
	numero: string | null;
	date: DateCivile;
	montant: Centimes;
	lignes: LigneVentilee[];
};

/** Q1 : une Recette sur le Compte des chèques à remettre, avec une ou plusieurs Lignes. */
export function brouillonChequeRecu(s: SaisieChequeRecu, compteId: number): Brouillon {
	return {
		genre: 'standard',
		origine: 'cheque_recu',
		date: s.date,
		libelle: `Chèque de ${s.emetteur}`,
		reference: s.numero,
		modePaiement: 'cheque',
		note: null,
		tiers: s.emetteur,
		sansPiece: true,
		cotes: [{ compteId, date: s.date, montant: s.montant }],
		lignes: s.lignes.map((l) => ligneDeSaisie(l, 'recette'))
	};
}

/** Q4 : un chèque remis ne bouge plus, un chèque rejeté non plus. */
export function deciderModificationCheque(j: JournalCheques, c: ChequeRecuJ): Resultat<true> {
	const etat = etatChequeRecu(j, c);
	if (etat === 'rejete') return echec('cheque_rejete');
	return etat === 'en_attente' ? succes(true) : echec('cheque_remis');
}

export type DemandeRemise = {
	chequeIds: readonly number[];
	compteId: number;
	date: DateCivile;
	/** Le total vu à l'écran : le paquet en main, il doit tomber juste (Q2). */
	total: Centimes;
};

/** Q2 : seuls des chèques en attente, vers une banque ou un livret, pour le total annoncé. */
export function deciderRemise(
	j: JournalCheques & Pick<GrandJournal, 'comptes'>,
	d: DemandeRemise
): Resultat<ChequeRecuJ[]> {
	const compte = j.comptes.find((c) => c.id === d.compteId);
	if ((compte?.type !== 'banque' && compte?.type !== 'epargne') || !compte.actif) {
		return echec('remise_compte_invalide', { champ: 'compteId' });
	}
	if (d.chequeIds.length === 0) return echec('remise_vide');
	const cheques = j.chequesRecus.filter((c) => d.chequeIds.includes(c.id));
	const disponibles = cheques.filter((c) => etatChequeRecu(j, c) === 'en_attente');
	if (cheques.length !== new Set(d.chequeIds).size || disponibles.length !== cheques.length) {
		return echec('remise_desequilibree');
	}
	if (sommeCentimes(cheques.map((c) => montantRecu(j, c))) !== d.total) {
		return echec('remise_desequilibree');
	}
	// Remis avant d'être reçu, le chèque rendrait le Compte négatif entre les deux dates (Q3).
	const derniere = cheques.map((c) => operationDe(j, c.operationId)?.date ?? d.date).sort();
	if ((derniere.at(-1) ?? d.date) > d.date) {
		return echec('remise_date_anterieure', { champ: 'date' });
	}
	return succes(cheques);
}

export const accordCheques = (n: number) => `${n} ${n > 1 ? 'chèques' : 'chèque'}`;

/** Q2 : un Mouvement interne des chèques à remettre vers la banque ou le livret. */
export function brouillonRemise(o: {
	numero: number;
	nombre: number;
	depuisId: number;
	versId: number;
	date: DateCivile;
	total: Centimes;
}): Brouillon {
	return {
		genre: 'interne',
		origine: 'remise',
		date: o.date,
		libelle: `Remise n° ${o.numero}, ${accordCheques(o.nombre)}`,
		reference: null,
		modePaiement: 'cheque',
		note: null,
		tiers: null,
		sansPiece: true,
		cotes: [
			{ compteId: o.depuisId, date: o.date, montant: centimes(-o.total) },
			{ compteId: o.versId, date: o.date, montant: o.total }
		],
		lignes: []
	};
}

/** Q4 : pointée, elle ne s'annule pas. Un rejet dépend de sa présence sur le Compte. */
export function deciderAnnulationRemise(j: JournalCheques, r: RemiseJ): Resultat<true> {
	if (etatRemise(j, r) === 'annulee') return echec('operation_annulee');
	const { cheques } = chequesDeRemise(j, r.id);
	return cheques.some((c) => c.operationRejetId !== null)
		? echec('remise_avec_rejet')
		: succes(true);
}

export type RejetDecide = { compteId: number; date: DateCivile; operation: OperationJ };

/**
 * Sur le Compte où se trouve le chèque. Dans un Exercice clôturé, la date passe au premier jour
 * de l'Exercice ouvert : le rejet s'y enregistre, et ses Lignes restent rattachées à l'origine.
 */
export function deciderRejet(
	j: JournalCheques,
	exercices: readonly Exercice[],
	c: ChequeRecuJ,
	date: DateCivile
): Resultat<RejetDecide> {
	if (c.operationRejetId !== null) return echec('cheque_rejete');
	const operation = operationDe(j, c.operationId);
	const compteId = compteDuCheque(j, c);
	if (operation === undefined || compteId === undefined) return echec('element_introuvable');
	const retenue = dateDepuisLigne(exercices, date);
	if (!retenue.ok) return retenue;
	const arrivee = arriveeDuCheque(j, c) as DateCivile;
	if (retenue.valeur.date < arrivee) return echec('rejet_date_anterieure', { champ: 'date' });
	return succes({ compteId, date: retenue.valeur.date, operation });
}

/** Q5 : Lignes opposées à l'origine, rangées en réduction de recette (`est_reduction`). */
export function brouillonRejet(c: ChequeRecuJ, d: RejetDecide): Brouillon {
	const lignes = d.operation.lignes.map((l) => ({
		montant: centimes(-l.montant),
		estReduction: true,
		natureId: l.natureId,
		actionId: l.actionId,
		exerciceRattachementId: l.exerciceRattachementId,
		note: null
	}));
	return {
		genre: 'standard',
		origine: 'cheque_rejete',
		date: d.date,
		libelle: `Rejet du chèque de ${c.emetteur}`,
		reference: c.numero,
		modePaiement: 'cheque',
		note: null,
		tiers: c.emetteur,
		sansPiece: true,
		cotes: [
			{
				compteId: d.compteId,
				date: d.date,
				montant: sommeCentimes(lignes.map((l) => l.montant))
			}
		],
		lignes
	};
}

/** Le rejet s'annule tant que son Exercice est ouvert : `deciderAnnulation` tranche le reste. */
export function rejetDe(j: JournalOperations, c: ChequeRecuJ): OperationJ | undefined {
	return operationDe(j, c.operationRejetId);
}

export const sansZeros = (numero: string) => numero.trim().replace(/^0+(?=\d)/, '');

export const memeNumero = (a: string, b: string) => sansZeros(a) === sansZeros(b);

type JournalRegistre = Pick<GrandJournal, 'operations' | 'chequesEmis'>;

/** Paiement par chèque saisi au jalon 1 : son n° en `reference` compte comme inscrit. */
function porteLeNumero(op: OperationJ, numero: string): boolean {
	return (
		op.origine === 'saisie' &&
		op.modePaiement === 'cheque' &&
		op.reference !== null &&
		memeNumero(op.reference, numero)
	);
}

export function numeroInscrit(j: JournalRegistre, numero: string): boolean {
	return (
		j.chequesEmis.some((c) => memeNumero(c.numero, numero)) ||
		j.operations.some((op) => porteLeNumero(op, numero))
	);
}

/** Un Chèque émis du registre : paiement par chèque, avec son bénéficiaire. */
export function estPaiementCheque(b: Pick<Brouillon, 'origine' | 'modePaiement' | 'cotes'>) {
	const sortie = b.cotes.length === 1 && (b.cotes[0]?.montant ?? 0) < 0;
	return b.origine === 'saisie' && b.modePaiement === 'cheque' && sortie;
}

/**
 * La formule d'un paiement annulé se réutilise : c'est la correction d'une saisie.
 * Une formule détruite sans paiement, non : le chèque n'existe plus.
 */
export function numeroReutilisable(
	j: Pick<GrandJournal, 'operations'>,
	e: Pick<ChequeEmisJ, 'operationId' | 'annuleLe'>
): boolean {
	return (
		e.operationId !== null &&
		e.annuleLe !== null &&
		!j.operations.some((o) => o.id === e.operationId)
	);
}

export function etatChequeEmis(
	j: Pick<GrandJournal, 'operations' | 'pointages'>,
	e: Pick<ChequeEmisJ, 'operationId' | 'annuleLe'>
): EtatChequeEmis {
	if (e.annuleLe !== null) return 'annule';
	const op = j.operations.find((o) => o.id === e.operationId);
	return pointe(j, op?.cotes[0]?.id) ? 'pointe' : 'emis';
}
