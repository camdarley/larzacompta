/** Ports de l'hexagone : l'application ne connaît que ces contrats. */
import type { AccesConnecte, Preferences, Tentative } from '#lib/domaine/acces.ts';
import type { DateCivile, Instant } from '#lib/domaine/dates.ts';
import type { Role } from '#lib/domaine/droits.ts';
import type { Exercice, NouvelExercice } from '#lib/domaine/exercices.ts';
import type { Centimes } from '#lib/domaine/montant.ts';
import type {
	Action,
	Ancre,
	Association,
	CodeSysteme,
	Compte,
	Groupe,
	Nature,
	TypeCompte
} from '#lib/domaine/parametrage.ts';
import type { Resultat } from '#lib/domaine/resultat.ts';

export type Horloge = { maintenant(): Instant };

export type Hacheur = {
	hacher(motDePasse: string): string;
	verifier(motDePasse: string, phc: string): boolean;
};

export type Jetons = {
	/** 256 bits aléatoires, encodés pour une URL ou un cookie. */
	generer(): string;
	empreinte(jeton: string): string;
};

/** Exécute `f` dans une transaction. Un Resultat en échec, comme une exception, annule tout. */
export type Transaction = <T>(f: () => Resultat<T>) => Resultat<T>;

export type LigneAcces = AccesConnecte & {
	aMotDePasse: boolean;
	creeLe: Instant;
	dernierAccesLe: Instant | null;
	revoqueLe: Instant | null;
	hash: string | null;
};

export type JetonAcces = {
	hashJeton: string;
	accesId: number;
	expireLe: Instant;
	utiliseLe: Instant | null;
};

export type SessionConnexion = {
	hashJeton: string;
	accesId: number;
	creeLe: Instant;
	derniereActiviteLe: Instant;
	expireLe: Instant;
};

export type DepotAcces = {
	compter(): number;
	parId(id: number): LigneAcces | null;
	parIdentifiant(identifiant: string): LigneAcces | null;
	lister(): LigneAcces[];
	tresoriersActifs(): { id: number }[];
	creer(a: {
		identifiant: string;
		nomAffiche: string;
		role: Role;
		hash?: string | null;
		creeLe: Instant;
	}): number;
	definirIdentite(id: number, identifiant: string, nomAffiche: string): void;
	definirMotDePasse(id: number, hash: string): void;
	definirPreferences(id: number, preferences: Preferences): void;
	noterAcces(id: number, le: Instant): void;
	revoquer(id: number, le: Instant): void;

	creerJeton(j: { hashJeton: string; accesId: number; expireLe: Instant }): void;
	lireJeton(hashJeton: string): JetonAcces | null;
	utiliserJeton(hashJeton: string, le: Instant): void;
	supprimerJetons(accesId: number): void;

	creerSession(s: SessionConnexion): void;
	lireSession(hashJeton: string): SessionConnexion | null;
	toucherSession(hashJeton: string, activite: Instant, expireLe: Instant): void;
	supprimerSession(hashJeton: string): void;
	supprimerSessions(accesId: number): void;

	lireTentative(cle: string): Tentative | null;
	ecrireTentative(t: Tentative): void;
	effacerTentative(cle: string): void;
};

export type EntreeJournal = {
	id: number;
	horodatage: Instant;
	accesId: number | null;
	accesNom: string;
	evenement: string;
	entiteType: string;
	entiteId: number | null;
	resume: string;
};

export type NouvelleEntreeJournal = Omit<EntreeJournal, 'id'> & {
	avantJson: string | null;
	apresJson: string | null;
};

export type FiltresJournal = {
	personne?: string;
	type?: string;
	du?: DateCivile;
	au?: DateCivile;
};

export type DepotJournal = {
	ajouter(e: NouvelleEntreeJournal): void;
	/** `du` et `au` sont déjà convertis en instants par l'application. */
	lister(
		filtres: { personne?: string; type?: string; depuis?: Instant; jusqua?: Instant },
		page: { limite: number; decalage: number }
	): { entrees: EntreeJournal[]; total: number };
	personnes(): string[];
	types(): string[];
};

export type DepotParametrage = {
	association(): Association | null;
	ecrireAssociation(a: Omit<Association, 'etapeAssistant'>): void;
	definirEtapeAssistant(etape: number): void;

	comptes(): Compte[];
	creerCompte(c: { libelle: string; type: TypeCompte; ordre: number }): number;
	modifierCompte(id: number, c: { libelle: string; type: TypeCompte }): void;
	definirOrdreCompte(id: number, ordre: number): void;
	activerCompte(id: number, actif: boolean): void;
	supprimerCompte(id: number): void;
	compteUtilise(id: number): boolean;

	groupes(): Groupe[];
	creerGroupe(g: { libelle: string; ordre: number }): number;
	renommerGroupe(id: number, libelle: string): void;
	definirOrdreGroupe(id: number, ordre: number): void;
	supprimerGroupe(id: number): void;
	groupeUtilise(id: number): boolean;

	natures(): Nature[];
	creerNature(n: {
		libelle: string;
		groupeId: number;
		neutre: boolean;
		codeSysteme: CodeSysteme | null;
	}): number;
	modifierNature(id: number, n: { libelle: string; groupeId: number; neutre: boolean }): void;
	activerNature(id: number, actif: boolean): void;
	supprimerNature(id: number): void;
	natureUtilisee(id: number): boolean;

	actions(): Action[];
	creerAction(a: { libelle: string; groupeId: number; avecCaisse: boolean }): number;
	modifierAction(id: number, a: { libelle: string; groupeId: number; avecCaisse: boolean }): void;
	activerAction(id: number, actif: boolean): void;
	supprimerAction(id: number): void;
	actionUtilisee(id: number): boolean;

	ancres(): Ancre[];
	ecrireAncre(compteId: number, exerciceId: number, solde: Centimes): void;
};

export type DepotExercices = {
	lister(): Exercice[];
	creer(e: NouvelExercice): number;
};

export type Depots = {
	acces: DepotAcces;
	journal: DepotJournal;
	parametrage: DepotParametrage;
	exercices: DepotExercices;
};

export type Journaliseur = {
	info(message: string, champs?: Record<string, unknown>): void;
	erreur(message: string, champs?: Record<string, unknown>): void;
};
