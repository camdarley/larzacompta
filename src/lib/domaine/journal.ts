/**
 * Grand journal (SCHEMA-DONNEES §8) : le type lu par tous les calculs.
 * L'infrastructure le construit en lisant des lignes, sans aucun agrégat (AD-4).
 */
import type { DateCivile, Instant } from './dates.ts';
import type { Exercice } from './exercices.ts';
import type { Centimes } from './montant.ts';
import type { Ancre, Compte } from './parametrage.ts';

export const GENRES = ['standard', 'interne', 'compensee'] as const;
export type Genre = (typeof GENRES)[number];

export const ORIGINES = [
	'saisie',
	'ajustement',
	'recette_especes',
	'ecart_caisse',
	'cheque_recu',
	'cheque_rejete',
	'remise'
] as const;
export type Origine = (typeof ORIGINES)[number];

export const MODES_PAIEMENT = [
	'virement',
	'prelevement',
	'cheque',
	'especes',
	'carte',
	'sumup',
	'autre'
] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export const LIBELLES_MODE_PAIEMENT: Record<ModePaiement, string> = {
	virement: 'Virement',
	prelevement: 'Prélèvement',
	cheque: 'Chèque',
	especes: 'Espèces',
	carte: 'Carte',
	sumup: 'SumUp',
	autre: 'Autre'
};

export const PHASES_SESSION = ['pendant', 'apres_comptage'] as const;
/** `pendant` : avant le Comptage final, compté dans la Recette d'espèces (C5). */
export type PhaseSession = (typeof PHASES_SESSION)[number];

export type CoteJ = {
	id: number;
	operationId: number;
	compteId: number;
	date: DateCivile;
	montant: Centimes;
	/** Toujours renseignés ensemble (C4). Absents d'un Côté sans Session. */
	sessionCaisseId?: number | null;
	sessionPhase?: PhaseSession | null;
};

export type LigneJ = {
	id: number;
	operationId: number;
	ordre: number;
	montant: Centimes;
	estReduction: boolean;
	natureId: number;
	actionId: number | null;
	exerciceRattachementId: number;
	note: string | null;
};

export type PieceJ = { id: number; sha256: string; nomOriginal: string; mime: string };

export type OperationJ = {
	id: number;
	genre: Genre;
	origine: Origine;
	date: DateCivile;
	libelle: string;
	reference: string | null;
	modePaiement: ModePaiement | null;
	note: string | null;
	tiers: string | null;
	liaisonId: number | null;
	sansPiece: boolean;
	version: number;
	creeLe: Instant;
	annuleeLe: Instant | null;
	cotes: CoteJ[];
	lignes: LigneJ[];
	pieces: PieceJ[];
};

export const TYPES_LIAISON = ['paiement_multiple', 'somme_a_rendre'] as const;
export type TypeLiaison = (typeof TYPES_LIAISON)[number];
export type LiaisonJ = { id: number; type: TypeLiaison; libelle: string };

export type Constat = {
	id: number;
	compteId: number;
	date: DateCivile;
	solde: Centimes;
	source: 'releve' | 'saisie';
	creeLe: Instant;
};

export type LigneReleveJ = {
	id: number;
	compteId: number;
	date: DateCivile;
	montant: Centimes;
	libelle: string;
	doublon: 'non' | 'a_confirmer' | 'confirme';
	/** Nul pour une ligne saisie à la main. */
	importId: number | null;
	identifiantSource: string | null;
	empreinte: string;
};

export type CoupureJ = { coupure: Centimes; quantite: number };

export type TypeComptage = 'ouverture' | 'fin' | 'controle';

export type ComptageJ = {
	id: number;
	compteId: number;
	sessionCaisseId: number | null;
	type: TypeComptage;
	date: DateCivile;
	compteLe: Instant;
	saisiLe: Instant;
	saisiPar: number;
	operationEcartId: number | null;
	coupures: CoupureJ[];
};

export type SessionJ = {
	id: number;
	compteId: number;
	actionId: number | null;
	ouverteLe: Instant;
	ouvertePar: number;
	clotureeLe: Instant | null;
	clotureePar: number | null;
	operationRecetteId: number | null;
};

export type PointageJ = {
	id: number;
	compteId: number;
	coteIds: number[];
	ligneReleveIds: number[];
};

export type ReglementJ = { operationId: number; montant: Centimes };

export type CreanceDetteJ = {
	id: number;
	sens: 'creance' | 'dette';
	tiers: string;
	motif: string;
	montant: Centimes;
	date: DateCivile;
	actionId: number | null;
	note: string | null;
	annuleeLe: Instant | null;
	reglements: ReglementJ[];
	/** Née d'une Facture ou d'un Avoir (AD-12). Elle n'entre pas dans l'empreinte de clôture. */
	factureId?: number | null;
	factureNumero?: string | null;
};

/** `numero` : suite propre aux bordereaux. Compte et total se lisent sur l'Opération interne. */
export type RemiseJ = { id: number; numero: number; operationId: number };

/** Aucun statut ni montant : ils se déduisent (AD-11). */
export type ChequeRecuJ = {
	id: number;
	operationId: number;
	emetteur: string;
	banque: string | null;
	numero: string | null;
	dateCheque: DateCivile | null;
	remiseId: number | null;
	operationRejetId: number | null;
};

/** `operationId` nul : formule annulée sans paiement, conservée au registre. */
export type ChequeEmisJ = {
	id: number;
	numero: string;
	beneficiaire: string;
	operationId: number | null;
	annuleLe: Instant | null;
};

export type GrandJournal = {
	exercices: Exercice[];
	comptes: Compte[];
	ancres: Ancre[];
	/** Non annulées : une Opération annulée ne peut pas se glisser dans un calcul. */
	operations: OperationJ[];
	/** Lues seulement par la recherche et l'historique. */
	operationsAnnulees: OperationJ[];
	liaisons: LiaisonJ[];
	constats: Constat[];
	comptages: ComptageJ[];
	sessions: SessionJ[];
	pointages: PointageJ[];
	lignesReleve: LigneReleveJ[];
	remises: RemiseJ[];
	/** Sans ceux dont l'Opération est annulée : ils sortent de tous les calculs. */
	chequesRecus: ChequeRecuJ[];
	chequesEmis: ChequeEmisJ[];
	creancesDettes: CreanceDetteJ[];
};

export function journalVide(): GrandJournal {
	return {
		exercices: [],
		comptes: [],
		ancres: [],
		operations: [],
		operationsAnnulees: [],
		liaisons: [],
		constats: [],
		comptages: [],
		sessions: [],
		pointages: [],
		lignesReleve: [],
		remises: [],
		chequesRecus: [],
		chequesEmis: [],
		creancesDettes: []
	};
}
