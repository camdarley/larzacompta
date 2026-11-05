/** Seul fichier qui instancie les adaptateurs (AD-1). */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { URL_VERSIONS, VERSION } from '#lib/produit.ts';
import { creerAcces } from './application/acces/index.ts';
import {
	contexte,
	creerExecuteur,
	creerLecteur,
	type Ctx,
	type Socle
} from './application/executer.ts';
import { creerCaisses } from './application/caisses/index.ts';
import { creerCreances } from './application/creances/index.ts';
import { creerEtats } from './application/etats/index.ts';
import { creerExercices } from './application/exercices/index.ts';
import { creerExploitation } from './application/exploitation/index.ts';
import { creerJournal } from './application/journal/index.ts';
import { creerOperations } from './application/operations/index.ts';
import { creerParametrage } from './application/parametrage/index.ts';
import { creerPieces } from './application/pieces/index.ts';
import { creerPointage } from './application/pointage/index.ts';
import type {
	Archiveur,
	CodeSource,
	Fichiers,
	Hacheur,
	Horloge,
	Journaliseur,
	SourceVersions
} from './application/ports.ts';
import { creerJetons } from './infra/auth/jetons.ts';
import { creerHacheur } from './infra/auth/mot-de-passe.ts';
import { genererCsv } from './infra/documents/csv.ts';
import { genererPdf } from './infra/documents/pdf/index.ts';
import { genererXlsx } from './infra/documents/xlsx.ts';
import { genererZip } from './infra/documents/archive.ts';
import { creerFichiers } from './infra/fichiers/index.ts';
import { creerJournaliseur } from './infra/logs.ts';
import { demarrerMinuteur } from './infra/minuteur.ts';
import { creerArchiveur } from './infra/sauvegarde/index.ts';
import { restaurer, type OptionsRestauration } from './infra/sauvegarde/restauration.ts';
import { creerRestic } from './infra/sauvegarde/restic.ts';
import { sourceCsv } from './infra/sources/csv.ts';
import { estOfx, sourceOfx } from './infra/sources/ofx.ts';
import { ouvrirBase, type Base } from './infra/sqlite/connexion.ts';
import { creerDepotAcces } from './infra/sqlite/depot-acces.ts';
import { creerDepotCaisses } from './infra/sqlite/depot-caisses.ts';
import { creerDepotCreances } from './infra/sqlite/depot-creances.ts';
import { creerDepotExercices } from './infra/sqlite/depot-exercices.ts';
import { creerDepotExploitation } from './infra/sqlite/depot-exploitation.ts';
import { creerDepotJournal } from './infra/sqlite/depot-journal.ts';
import { creerDepotOperations } from './infra/sqlite/depot-operations.ts';
import { creerDepotParametrage } from './infra/sqlite/depot-parametrage.ts';
import { creerDepotPieces } from './infra/sqlite/depot-pieces.ts';
import { creerDepotPointage } from './infra/sqlite/depot-pointage.ts';
import { appliquerMigrations, chargerMigrations } from './infra/sqlite/migrateur.ts';
import { creerTransaction } from './infra/sqlite/transaction.ts';
import { creerSourceVersions } from './infra/version/index.ts';

export type OptionsComposition = {
	base: Base;
	horloge?: Horloge;
	hacheur?: Hacheur;
	journaliseur?: Journaliseur;
	fichiers?: Fichiers;
	archiveur?: Archiveur;
	versions?: SourceVersions;
};

function creerCodeSource(archive: string | undefined): CodeSource {
	const present = () => archive !== undefined && existsSync(archive);
	return {
		present,
		lire: () => (present() ? new Uint8Array(readFileSync(archive as string)) : null)
	};
}

export function composer(options: OptionsComposition) {
	const horloge: Horloge = options.horloge ?? { maintenant: () => new Date().toISOString() };
	const parametrage = creerDepotParametrage(options.base);
	const exercices = creerDepotExercices(options.base);
	const socle: Socle = {
		depots: {
			acces: creerDepotAcces(options.base),
			journal: creerDepotJournal(options.base),
			parametrage,
			exercices,
			operations: creerDepotOperations(options.base, parametrage, exercices),
			pointage: creerDepotPointage(options.base),
			pieces: creerDepotPieces(options.base),
			creances: creerDepotCreances(options.base),
			caisses: creerDepotCaisses(options.base),
			exploitation: creerDepotExploitation(options.base)
		},
		transaction: creerTransaction(options.base),
		horloge,
		hacheur: options.hacheur ?? creerHacheur(),
		jetons: creerJetons(),
		journaliseur: options.journaliseur ?? creerJournaliseur(() => horloge.maintenant()),
		exporteurs: {
			csv: genererCsv,
			pdf: (modele) => genererPdf(modele, process.env.APE_POLICES ?? 'static/polices-pdf'),
			xlsx: genererXlsx,
			zip: genererZip
		},
		sources: { ofx: sourceOfx, csv: sourceCsv, estOfx },
		fichiers: options.fichiers ?? creerFichiers(join(dossierDonnees(), 'fichiers')),
		archiveur:
			options.archiveur ??
			creerArchiveur(
				options.base,
				dossierDonnees(),
				creerRestic(dossierDonnees(), process.env, process.env.APE_RESTIC)
			),
		versions: options.versions ?? creerSourceVersions(process.env.APE_URL_VERSIONS ?? URL_VERSIONS),
		versionActuelle: VERSION,
		revision: process.env.APE_REVISION || null,
		codeSource: creerCodeSource(process.env.APE_CODE_SOURCE)
	};
	const executer = creerExecuteur(socle);
	const lire = creerLecteur();

	return {
		socle,
		executer,
		lire,
		ctx: (acces: AccesConnecte | null): Ctx => contexte(horloge, acces),
		acces: creerAcces(socle, executer, lire),
		journal: creerJournal(socle, lire),
		parametrage: creerParametrage(socle, executer, lire),
		exercices: creerExercices(socle, executer, lire),
		operations: creerOperations(socle, executer, lire),
		pointage: creerPointage(socle, executer, lire),
		pieces: creerPieces(socle, executer, lire),
		creances: creerCreances(socle, executer, lire),
		caisses: creerCaisses(socle, executer, lire),
		etats: creerEtats(socle, executer, lire),
		exploitation: creerExploitation(socle, executer, lire)
	};
}

export type Application = ReturnType<typeof composer>;

export function dossierDonnees(): string {
	return process.env.APE_DONNEES ?? 'data';
}

function demarrer(): Application {
	const dossier = dossierDonnees();
	mkdirSync(dossier, { recursive: true });
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	appliquerMigrations(base, chargerMigrations(process.env.APE_MIGRATIONS ?? 'migrations'), {
		dossierCopies: join(dossier, 'avant-migration'),
		horodatage: new Date().toISOString()
	});
	return composer({ base });
}

let instance: Application | null = null;

/** Une seule connexion dans le process (AD-13). Une migration en échec arrête le démarrage. */
export function application(): Application {
	instance ??= demarrer();
	return instance;
}

/**
 * Tâches de fond du serveur. `APE_SAUVEGARDE=1` vient de l'image Docker : en développement et en
 * parcours, pas de restic, donc pas de minuteur, et aucun échec inventé à l'écran.
 */
export function demarrerTachesDeFond() {
	const app = application();
	demarrerMinuteur({
		dossier: dossierDonnees(),
		sauvegarde: process.env.APE_SAUVEGARDE === '1',
		versions: process.env.VERIFIER_VERSION !== '0',
		exploitation: app.exploitation,
		horloge: app.socle.horloge,
		journaliseur: app.socle.journaliseur
	});
}

/** `ape restaurer` : sans `application()`, qui ouvrirait et migrerait la base à remplacer. */
export function restaurerInstance(options: Omit<OptionsRestauration, 'maintenant'>) {
	const dossier = dossierDonnees();
	mkdirSync(dossier, { recursive: true });
	return restaurer(dossier, creerRestic(dossier, process.env, process.env.APE_RESTIC), {
		...options,
		maintenant: new Date().toISOString()
	});
}
