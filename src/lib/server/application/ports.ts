/** Ports de l'hexagone : l'application ne connaît que ces contrats. */
import type { AccesConnecte, Preferences, Tentative } from '#lib/domaine/acces.ts';
import type { DateCivile, Instant } from '#lib/domaine/dates.ts';
import type { Role } from '#lib/domaine/droits.ts';
import type { Exercice, NouvelExercice } from '#lib/domaine/exercices.ts';
import type {
	CoupureJ,
	GrandJournal,
	LiaisonJ,
	OperationJ,
	TypeComptage,
	TypeLiaison
} from '#lib/domaine/journal.ts';
import type { EntreeCreance } from '#lib/domaine/creances/index.ts';
import type { ModeleDocument } from '#lib/domaine/etats/documents.ts';
import type { StatutSauvegarde } from '#lib/domaine/exploitation.ts';
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
	hacher(motDePasse: string): Promise<string>;
	verifier(motDePasse: string, phc: string): Promise<boolean>;
};

export type EntreeArchive = { nom: string; lire(): Uint8Array | string | null };

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

	/** Caisses autorisées d'un·e compteur·se (A3). */
	caissesDe(accesId: number): number[];
	definirCaisses(accesId: number, compteIds: readonly number[]): void;

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
	creerCompte(c: { libelle: string; type: TypeCompte; ordre: number; reserve?: boolean }): number;
	modifierCompte(id: number, c: { libelle: string; type: TypeCompte; reserve?: boolean }): void;
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
	compteSource: string | null;
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
	/** Numéro de compte du dernier relevé qui en portait un. */
	dernierCompteSource(compteId: number): string | null;
	/** Fichiers de relevé conservés : comme une Pièce, ils ne sont pas des orphelins. */
	fichiersReleves(): string[];
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
	existe(sha256: string): boolean;
	/** Fichiers présents, pour repérer les orphelins en fin de sauvegarde (AD-17). */
	lister(): { sha256: string; modifieLe: Instant }[];
	supprimer(sha256: string): void;
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

export type NouveauComptage = {
	compteId: number;
	sessionCaisseId: number | null;
	type: TypeComptage;
	date: DateCivile;
	compteLe: Instant;
	saisiLe: Instant;
	saisiPar: number;
	coupures: readonly CoupureJ[];
};

/** Seul chemin vers `session_caisse`, `comptage` et `comptage_coupure` (AD-7). */
export type DepotCaisses = {
	creerSession(s: {
		compteId: number;
		actionId: number | null;
		ouverteLe: Instant;
		ouvertePar: number;
	}): number;
	cloturerSession(id: number, le: Instant, par: number, recetteId: number | null): void;
	rouvrirSession(id: number): void;
	creerComptage(c: NouveauComptage): number;
	/** Remplace les coupures : un Comptage ne stocke aucun total. */
	corrigerComptage(
		id: number,
		c: Pick<NouveauComptage, 'date' | 'saisiLe' | 'saisiPar' | 'coupures'>
	): void;
	lierEcart(id: number, operationId: number | null): void;
};

export type NouveauChequeRecu = {
	operationId: number;
	emetteur: string;
	banque: string | null;
	numero: string | null;
};

export type NouveauChequeEmis = {
	numero: string;
	beneficiaire: string;
	operationId: number | null;
	annuleLe: Instant | null;
	annulePar: number | null;
};

/** Seul chemin vers `cheque_recu`, `cheque_emis` et `remise` (AD-7). Aucun statut, aucun montant. */
export type DepotCheques = {
	creerRecu(c: NouveauChequeRecu): number;
	modifierRecu(id: number, c: Omit<NouveauChequeRecu, 'operationId'>): void;
	remettre(chequeId: number, remiseId: number): void;
	/** Q4 : la Remise annulée libère ses chèques. */
	liberer(remiseId: number): void;
	definirRejet(chequeId: number, operationId: number | null): void;
	dernierNumeroRemise(): number;
	creerRemise(r: { numero: number; operationId: number }): number;
	creerEmis(c: NouveauChequeEmis): number;
	modifierEmis(id: number, c: { numero: string; beneficiaire: string }): void;
	/** Une formule annulée reprend vie pour le paiement qui la corrige. */
	reprendreEmis(id: number, c: { numero: string; beneficiaire: string; operationId: number }): void;
	annulerEmis(id: number, le: Instant, par: number): void;
	supprimerEmis(id: number): void;
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
	/** Une Pièce à la fois : l'archive pèse parfois plus que la mémoire du serveur. */
	zip(fichiers: Iterable<EntreeArchive>): ReadableStream<Uint8Array>;
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
	caisses: DepotCaisses;
	cheques: DepotCheques;
	exploitation: DepotExploitation;
};

export type ExecutionSauvegarde = {
	id: number;
	debutLe: Instant;
	finLe: Instant | null;
	statut: StatutSauvegarde;
	horsVps: boolean;
	instantane: string | null;
	message: string | null;
};

/** Seul chemin vers `sauvegarde_execution` et `version_disponible` (AD-7). */
export type DepotExploitation = {
	derniere(): ExecutionSauvegarde | null;
	derniereReussite(): ExecutionSauvegarde | null;
	debuter(debutLe: Instant, horsVps: boolean): number;
	terminer(
		id: number,
		fin: {
			finLe: Instant;
			statut: 'reussie' | 'echouee';
			instantane?: string | null;
			message?: string | null;
		}
	): void;
	/** Lignes `en_cours` encore ouvertes, pour les fermer : leur process n'existe plus. */
	enCours(): ExecutionSauvegarde[];
	version(): { derniereVersion: string | null; verifieLe: Instant | null };
	noterVersion(derniereVersion: string | null, verifieLe: Instant): void;
};

/** Sauvegarde hors du process (AD-17). Lève une erreur au message sûr si elle échoue. */
export type Archiveur = {
	horsVps: boolean;
	sauvegarder(options: { controler: boolean }): Promise<{ instantane: string | null }>;
};

/** Dernière version publiée, ou `null` si elle ne se lit pas. */
export type SourceVersions = { derniere(): Promise<string | null> };

/** Archive du code exact de ce build (AGPL-3.0 §13), posée dans l'image. Absente en développement. */
export type CodeSource = { present(): boolean; lire(): Uint8Array | null };

export type Journaliseur = {
	info(message: string, champs?: Record<string, unknown>): void;
	erreur(message: string, champs?: Record<string, unknown>): void;
};
