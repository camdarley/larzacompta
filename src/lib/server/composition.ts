/** Seul fichier qui instancie les adaptateurs (AD-1). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AccesConnecte } from '#lib/domaine/acces.ts';
import { creerAcces } from './application/acces/index.ts';
import {
	contexte,
	creerExecuteur,
	creerLecteur,
	type Ctx,
	type Socle
} from './application/executer.ts';
import { creerExercices } from './application/exercices/index.ts';
import { creerJournal } from './application/journal/index.ts';
import { creerOperations } from './application/operations/index.ts';
import { creerParametrage } from './application/parametrage/index.ts';
import { creerPointage } from './application/pointage/index.ts';
import type { Fichiers, Hacheur, Horloge, Journaliseur } from './application/ports.ts';
import { creerJetons } from './infra/auth/jetons.ts';
import { creerHacheur } from './infra/auth/mot-de-passe.ts';
import { genererCsv } from './infra/documents/csv.ts';
import { creerFichiers } from './infra/fichiers/index.ts';
import { creerJournaliseur } from './infra/logs.ts';
import { sourceCsv } from './infra/sources/csv.ts';
import { estOfx, sourceOfx } from './infra/sources/ofx.ts';
import { ouvrirBase, type Base } from './infra/sqlite/connexion.ts';
import { creerDepotAcces } from './infra/sqlite/depot-acces.ts';
import { creerDepotExercices } from './infra/sqlite/depot-exercices.ts';
import { creerDepotJournal } from './infra/sqlite/depot-journal.ts';
import { creerDepotOperations } from './infra/sqlite/depot-operations.ts';
import { creerDepotParametrage } from './infra/sqlite/depot-parametrage.ts';
import { creerDepotPointage } from './infra/sqlite/depot-pointage.ts';
import { appliquerMigrations, chargerMigrations } from './infra/sqlite/migrateur.ts';
import { creerTransaction } from './infra/sqlite/transaction.ts';

export type OptionsComposition = {
	base: Base;
	horloge?: Horloge;
	hacheur?: Hacheur;
	journaliseur?: Journaliseur;
	fichiers?: Fichiers;
};

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
			pointage: creerDepotPointage(options.base)
		},
		transaction: creerTransaction(options.base),
		horloge,
		hacheur: options.hacheur ?? creerHacheur(),
		jetons: creerJetons(),
		journaliseur: options.journaliseur ?? creerJournaliseur(() => horloge.maintenant()),
		exporteurs: { csv: genererCsv },
		sources: { ofx: sourceOfx, csv: sourceCsv, estOfx },
		fichiers: options.fichiers ?? creerFichiers(join(dossierDonnees(), 'fichiers'))
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
		pointage: creerPointage(socle, executer, lire)
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
