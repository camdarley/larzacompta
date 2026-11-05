/** Ports de l'hexagone : l'application ne connaît que ces contrats. */
import type { AccesConnecte, Preferences, Tentative } from '#lib/domaine/acces.ts';
import type { DateCivile, Instant } from '#lib/domaine/dates.ts';
import type { Role } from '#lib/domaine/droits.ts';
import type { Exercice, NouvelExercice } from '#lib/domaine/exercices.ts';
import type { GrandJournal, LiaisonJ, OperationJ, TypeLiaison } from '#lib/domaine/journal.ts';
import type { EntreeCreance } from '#lib/domaine/creances/index.ts';
import type { ModeleDocument } from '#lib/domaine/etats/documents.ts';
import type { BrouillonValide } from '#lib/domaine/operations/validation.ts';
import type { Centimes } from '#lib/domaine/montant.ts';
import type { PieceStockee } from '#lib/domaine/pieces/index.ts';
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
import type { ReglageCsv, TableauCsv } from '#lib/domaine/releve/csv.ts';
import type { LignePlanifiee } from '#lib/domaine/releve/planifier.ts';
import type { Periode } from '#lib/domaine/releve/trous.ts';
import type { ReleveNormalise } from '#lib/domaine/releve/types.ts';
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
	/** Historique d'un élément, du plus récent au plus ancien. */
	parEntite(entiteType: string, entiteId: number): EntreeJournal[];
	/** Élément déjà écrit sous cette clé de saisie : un renvoi ne l'écrit pas deux fois. */
	entiteDeCle(cle: string): number | null;
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

export type ClotureExercice = {
	exerciceId: number;
	clotureLe: Instant;
	cloturePar: number;
	parametrageFigeJson: string;
	empreinte: string;
};

export type DepotExercices = {
	lister(): Exercice[];
	creer(e: NouvelExercice): number;
	/** Dans une transaction : `statut = 'cloture'`, paramétrage figé et empreinte (AD-5). */
	cloturer(c: ClotureExercice): void;
	cloture(exerciceId: number): ClotureExercice | null;
};

export type NouvelleOperation = BrouillonValide & { creeLe: Instant; creePar: number };

/** Seul chemin vers `operation`, `cote`, `ligne` et `liaison` (AD-7). */
export type DepotOperations = {
	/** Sans cache, entier à chaque demande (AD-4). Inclut les Opérations annulées, à part. */
	journal(): GrandJournal;
	parId(id: number): OperationJ | null;
	liaisons(): LiaisonJ[];
	creer(o: NouvelleOperation): number;
	/** Refuse par `false` si `version` a changé depuis la lecture (O10). */
	modifier(id: number, versionLue: number, o: BrouillonValide): boolean;
	annuler(id: number, le: Instant, par: number): void;
	/** Ne touche pas `version` : la dispense ne change aucun état, et n'invalide pas une saisie. */
	definirSansPiece(id: number, sansPiece: boolean): void;
	creerLiaison(l: { type: TypeLiaison; libelle: string }): number;
	definirLiaison(operationId: number, liaisonId: number | null): void;
	deplacerLiaison(depuis: number, vers: number): void;
	/** Détache ses Opérations, puis retire la liaison. */
	retirerLiaison(id: number): void;
	operationsDeLiaison(id: number): number[];
};

export type NouvelImport = {
	compteId: number;
	source: string;
	nomFichier: string;
	fichierSha256: string;
	dateMin: DateCivile | null;
	dateMax: DateCivile | null;
	lues: number;
	nouvelles: number;
	connues: number;
	importeLe: Instant;
	importePar: number;
};

export type NouveauConstat = {
	compteId: number;
	date: DateCivile;
	solde: Centimes;
	source: 'releve' | 'saisie';
	importId: number | null;
	creeLe: Instant;
	creePar: number;
};

/** Seul chemin vers le relevé, le Constat et le Pointage (AD-7). */
export type DepotPointage = {
	periodes(compteId: number): (Periode & { id: number })[];
	creerImport(i: NouvelImport): number;
	creerLigne(
		l: LignePlanifiee & { compteId: number; importId: number | null; creeLe: Instant }
	): number;
	confirmerLigne(id: number): void;
	supprimerLigne(id: number): void;
	creerConstat(c: NouveauConstat): number;
	creerPointage(p: {
		compteId: number;
		coteIds: readonly number[];
		ligneIds: readonly number[];
		creeLe: Instant;
		creePar: number;
	}): number;
	supprimerPointage(id: number): void;
	profil(compteId: number): ReglageCsv | null;
	ecrireProfil(compteId: number, reglage: ReglageCsv): void;
};

/** Une source ne fait que lire (AD-9). Rien de propre à une banque ne franchit ce port. */
export type EntreeSource = { octets: Uint8Array; reglage?: ReglageCsv | null };
export type SourceReleve = { lire(entree: EntreeSource): Resultat<ReleveNormalise> };
export type SourceCsv = SourceReleve & { tableau(octets: Uint8Array): Resultat<TableauCsv> };
export type Sources = {
	ofx: SourceReleve;
	csv: SourceCsv;
	estOfx(octets: Uint8Array): boolean;
};

/** Stockage adressé par contenu (AD-16). `ecrire` rend le SHA-256 du fichier. */
export type Fichiers = {
	ecrire(octets: Uint8Array): string;
	lire(sha256: string): Uint8Array | null;
};

/** Seul chemin vers `piece` et `piece_operation` (AD-7). */
export type DepotPieces = {
	lister(): PieceStockee[];
	parId(id: number): PieceStockee | null;
	parSha(sha256: string): PieceStockee | null;
	liens(): { pieceId: number; operationId: number }[];
	creer(p: Omit<PieceStockee, 'id'> & { creePar: number }): number;
	/** `false` si le lien existait déjà : rien n'a changé, rien à noter. */
	rattacher(pieceId: number, operationId: number): boolean;
	detacher(pieceId: number, operationId: number): boolean;
	supprimer(id: number): void;
};

/** Seul chemin vers `creance_dette` et `reglement` (AD-7). */
export type DepotCreances = {
	creer(c: EntreeCreance & { creeLe: Instant; creePar: number }): number;
	annuler(id: number, le: Instant, par: number): void;
	retablir(id: number): void;
	regler(creanceId: number, operationId: number, montant: Centimes): void;
};

export type Exporteurs = {
	/** CSV : UTF-8 avec BOM, séparateur `;`. Reçoit un modèle déjà calculé (AD-18). */
	csv(entetes: readonly string[], lignes: readonly (readonly string[])[]): string;
	/** PDF balisé, A4, noir sur blanc (AD-18). Aucun calcul de montant. */
	pdf(modele: ModeleDocument): Promise<Uint8Array>;
	/** Un nombre en euros au format monétaire, issu des centimes pour l'affichage seulement. */
	xlsx(modele: ModeleDocument): Promise<Uint8Array>;
	zip(fichiers: Readonly<Record<string, Uint8Array | string>>): Uint8Array;
};

export type Depots = {
	acces: DepotAcces;
	journal: DepotJournal;
	parametrage: DepotParametrage;
	exercices: DepotExercices;
	operations: DepotOperations;
	pointage: DepotPointage;
	pieces: DepotPieces;
	creances: DepotCreances;
};

export type Journaliseur = {
	info(message: string, champs?: Record<string, unknown>): void;
	erreur(message: string, champs?: Record<string, unknown>): void;
};
