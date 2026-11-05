/**
 * Le volume de NFR-7 : dix Exercices clos et un ouvert, soit environ 2 000 Opérations.
 * Sert à mesurer le Tableau de contrôle sur la petite machine visée (story 6.1).
 * Usage : node tests/jeux/volume.ts <dossier>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { centimes } from '#lib/domaine/montant.ts';
import type { EntreeCreation } from '#lib/server/application/operations/index.ts';
import { composer } from '#lib/server/composition.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { appliquerMigrations, chargerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';
import { COMPTES_FICTIFS } from './charger.ts';

const c = centimes;
const ANNEES = 10;
const OPERATIONS_PAR_AN = 200;
const DEBUT = 2016;

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(`Volume : ${r.erreur.code}`);
	return r.valeur;
}

export function chargerVolume(dossier: string) {
	mkdirSync(dossier, { recursive: true });
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const maintenant = '2026-11-05T10:00:00.000Z';
	appliquerMigrations(base, chargerMigrations('migrations'), { horodatage: maintenant });
	const app = composer({
		base,
		horloge: { maintenant: () => maintenant },
		fichiers: creerFichiers(join(dossier, 'fichiers')),
		journaliseur: { info() {}, erreur() {} }
	});
	const a = COMPTES_FICTIFS.tresorier;
	const id = app.socle.depots.acces.creer({
		identifiant: a.identifiant,
		nomAffiche: a.nom,
		role: 'tresorier',
		hash: app.socle.hacheur.hacher(a.motDePasse),
		creeLe: maintenant
	});
	const ctx = app.ctx({
		id,
		identifiant: a.identifiant,
		nomAffiche: a.nom,
		role: 'tresorier',
		preferences: { theme: 'systeme', raccourcis: true }
	});
	exiger(
		app.parametrage.enregistrerAssociation(ctx, {
			nom: 'APE des Tilleuls',
			adresse: '',
			moisDebutExercice: 9,
			mentionsFacture: ''
		})
	);
	exiger(
		app.exercices.demarrer(ctx, {
			anneeDebut: DEBUT,
			comptes: [{ libelle: 'Banque des Tilleuls', type: 'banque', solde: c(5_000_00) }]
		})
	);
	const depot = app.socle.depots.parametrage;
	depot.definirEtapeAssistant(5);
	const groupe = depot.groupes()[0]!.id;
	exiger(app.parametrage.creerNature(ctx, { libelle: 'Divers', groupeId: groupe, neutre: false }));
	const nature = depot.natures().find((n) => n.libelle === 'Divers')!.id;
	const compteId = depot.comptes()[0]!.id;

	for (let n = 0; n <= ANNEES; n++) {
		const annee = DEBUT + n;
		const courant = app.socle.depots.exercices.lister().find((e) => e.anneeDebut === annee)!;
		for (let i = 0; i < OPERATIONS_PAR_AN; i++) {
			const recette = i % 3 === 0;
			const montant = c(1_00 + ((i * 37) % 300_00));
			const mois = i % 12;
			const date =
				mois < 4
					? `${annee}-${String(9 + mois).padStart(2, '0')}-15`
					: `${annee + 1}-${String(mois - 3).padStart(2, '0')}-15`;
			exiger(
				app.operations.creer(ctx, {
					forme: 'standard',
					intention: recette ? 'recette' : 'depense',
					libelle: `Opération fictive ${annee}-${i}`,
					reference: null,
					modePaiement: 'virement',
					note: null,
					tiers: null,
					compteId,
					date,
					montant,
					lignes: [
						{
							montant,
							contraire: false,
							reduction: false,
							natureId: nature,
							actionId: null,
							exerciceRattachementId: null,
							note: null
						}
					]
				} as EntreeCreation)
			);
		}
		if (n < ANNEES) {
			exiger(app.exercices.ouvrirSuivant(ctx));
			exiger(app.exercices.cloturer(ctx, courant.id));
		}
	}
	const total = base.prepare('SELECT count(*) FROM operation').pluck().get();
	base.close();
	return total;
}

const [dossier] = process.argv.slice(2);
if (dossier) console.log(`${chargerVolume(dossier)} Opérations écrites dans ${dossier}.`);
