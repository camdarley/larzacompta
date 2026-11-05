/**
 * Formes de lecture d'une Opération, partagées par l'application et l'interface.
 * L'interface n'importe rien du serveur (AD-1) : elles vivent ici.
 */
import type { SessionDeSaisie } from '../caisse/saisie.ts';
import type { SoldeDeSomme } from '../creances/index.ts';
import type { DateCivile, Instant } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { LigneReleveJ, OperationJ } from '../journal.ts';
import type { Centimes } from '../montant.ts';
import type { Action, Compte, Groupe, Nature } from '../parametrage.ts';
import type { PieceVue } from '../pieces/index.ts';
import type { Intention } from './formes.ts';
import type { EtatPointage } from './lecture.ts';
import type { Recents } from './recents.ts';

export type EntreeHistorique = {
	id: number;
	horodatage: Instant;
	accesNom: string;
	resume: string;
};

/** Rangée de la liste `/operations`. */
export type RangeeOperation = {
	id: number;
	date: DateCivile;
	libelle: string;
	reference: string | null;
	genre: OperationJ['genre'];
	compte: string;
	natures: string;
	actions: string;
	montant: Centimes;
	annulee: boolean;
	cloture: boolean;
	pieces: number;
	/** Pointé si un Côté l'est, À pointer pour une banque ou un livret. */
	etat: EtatPointage | null;
	rattachements: string[];
	ligneTrouvee: string | null;
};

export type PageOperations = {
	rangees: RangeeOperation[];
	total: number;
	page: number;
	pages: number;
};

export type ContexteSaisie = {
	comptes: Compte[];
	/** Sessions ouvertes : un Côté sur leur caisse s'y rattache (C12). */
	sessions: SessionDeSaisie[];
	natures: Nature[];
	actions: Action[];
	groupes: Groupe[];
	exercices: Exercice[];
	recents: Recents;
	natureSommeARendre: number | null;
	aujourdhui: DateCivile;
};

export type MouvementBancaire = Pick<LigneReleveJ, 'id' | 'date' | 'montant' | 'libelle'>;

export type LiaisonVue = {
	id: number;
	type: 'paiement_multiple' | 'somme_a_rendre';
	phrase: string;
	libelle: string;
	total: Centimes;
	operations: { id: number; libelle: string; date: DateCivile; montant: Centimes }[];
};

export type DetailOperation = {
	operation: OperationJ;
	intention: Intention;
	annulee: boolean;
	pointee: boolean;
	/** Rangs des Côtés pointés : ces Côtés gardent montant et Compte. */
	rangsPointes: number[];
	/** Libellé de l'Exercice clôturé qui fige l'Opération. */
	figeePar: string | null;
	specialisee: boolean;
	liaison: LiaisonVue | null;
	/** Ce qu'il reste à rendre, pour une somme reçue. */
	resteARendre: Centimes | null;
	/** Pointages qui relient cette Opération : « Annuler le Pointage » les défait. */
	pointageIds: number[];
	mouvements: MouvementBancaire[];
	pieces: PieceVue[];
	/** La case « Pas besoin de Pièce » ne concerne qu'une dépense (FR-27). */
	estDepense: boolean;
	/** Créances et Dettes que cette Opération solde. */
	soldes: SoldeDeSomme[];
	historique: EntreeHistorique[];
};
