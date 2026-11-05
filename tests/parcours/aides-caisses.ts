/**
 * Instance à part pour les caisses : une APE imaginaire, écrite par les vrais cas d'usage,
 * dates calées sur aujourd'hui, avec une session par rôle.
 */
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { instantVersDate } from '../../src/lib/domaine/dates.ts';
import { anneeExerciceDe } from '../../src/lib/domaine/exercices.ts';
import { centimes as c } from '../../src/lib/domaine/montant.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import {
	appliquerMigrations,
	chargerMigrations
} from '../../src/lib/server/infra/sqlite/migrateur.ts';

export const JETONS = {
	tresorier: 'session-fictive-tresorerie-caisses',
	compteur: 'session-fictive-comptage-caisses',
	lecteur: 'session-fictive-lecture-caisses'
};

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

export function preparerCaisses(dossier: string) {
	mkdirSync(dossier, { recursive: true });
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const maintenant = new Date().toISOString();
	appliquerMigrations(base, chargerMigrations('migrations'), { horodatage: maintenant });
	const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });
	const depots = app.socle.depots;
	const acces = (
		identifiant: string,
		nomAffiche: string,
		role: 'tresorier' | 'compteur' | 'lecteur'
	) =>
		depots.acces.creer({
			identifiant,
			nomAffiche,
			role,
			hash: 'sans-mot-de-passe',
			creeLe: maintenant
		});
	const tresorier = acces('camille', 'Camille Fictive', 'tresorier');
	const compteur = acces('sam', 'Sam Fictif', 'compteur');
	const lecteur = acces('dominique', 'Dominique Fictive', 'lecteur');
	const demain = new Date(Date.now() + 86_400_000).toISOString();
	for (const [jeton, id] of [
		[JETONS.tresorier, tresorier],
		[JETONS.compteur, compteur],
		[JETONS.lecteur, lecteur]
	] as const) {
		depots.acces.creerSession({
			hashJeton: createHash('sha256').update(jeton).digest('hex'),
			accesId: id,
			creeLe: maintenant,
			derniereActiviteLe: maintenant,
			expireLe: demain
		});
	}

	const ctx = app.ctx(depots.acces.parId(tresorier));
	exiger(
		app.parametrage.enregistrerAssociation(ctx, {
			nom: 'APE des Tilleuls',
			adresse: '',
			moisDebutExercice: 9,
			mentionsFacture: ''
		})
	);
	const aujourdhui = instantVersDate(maintenant);
	const annee = anneeExerciceDe(aujourdhui, 9);
	exiger(
		app.exercices.demarrer(ctx, {
			anneeDebut: annee,
			comptes: [
				{ libelle: 'CCP imaginaire', type: 'banque', solde: c(1200_00) },
				{ libelle: 'Caisse 1', type: 'caisse', solde: c(80_00) },
				{ libelle: 'Caisse 2', type: 'caisse', solde: c(0) }
			]
		})
	);
	depots.parametrage.definirEtapeAssistant(99);
	const exercice = depots.exercices.lister().find((e) => e.statut === 'ouvert')!;
	const reserve = exiger(
		app.parametrage.creerCompte(ctx, {
			libelle: 'Réserve',
			type: 'caisse',
			reserve: true,
			ancre: { exerciceId: exercice.id, solde: c(500_00) }
		})
	);
	const groupeId = depots.parametrage.groupes()[0]!.id;
	exiger(app.parametrage.creerNature(ctx, { libelle: 'Buvette', groupeId, neutre: false }));
	const kermesse = exiger(
		app.parametrage.creerAction(ctx, { libelle: 'Kermesse', groupeId, avecCaisse: true })
	);
	const comptes = depots.parametrage.comptes();
	const caisse1 = comptes.find((x) => x.libelle === 'Caisse 1')!.id;
	const caisse2 = comptes.find((x) => x.libelle === 'Caisse 2')!.id;

	// La Caisse 2 a déjà servi : sa dernière clôture sert de Comptage d'ouverture à Sam.
	const veille = exiger(
		app.caisses.compterCaisse(ctx, {
			compteId: caisse2,
			actionId: null,
			date: aujourdhui,
			confirmation: c(0),
			coupures: []
		})
	).sessionId!;
	const FOND = [
		{ coupure: c(2000), quantite: 3 },
		{ coupure: c(1000), quantite: 5 },
		{ coupure: c(500), quantite: 4 },
		{ coupure: c(200), quantite: 5 },
		{ coupure: c(100), quantite: 8 },
		{ coupure: c(50), quantite: 4 }
	];
	exiger(
		app.caisses.compterSession(ctx, {
			sessionId: veille,
			coupures: FOND,
			date: aujourdhui,
			confirmation: null
		})
	);
	exiger(app.caisses.cloturer(ctx, veille));
	depots.acces.definirCaisses(compteur, [caisse2]);
	base.close();
	return { aujourdhui, kermesse, reserve, caisse1, caisse2, ccp: comptes[0]!.id };
}
