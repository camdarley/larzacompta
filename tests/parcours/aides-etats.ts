/**
 * Instance à part pour les états : une APE imaginaire complète, écrite par les vrais cas d'usage,
 * dates calées sur aujourd'hui. Aucun autre parcours n'y touche : chaque chiffre attendu se relit.
 */
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ajouterJours, instantVersDate } from '../../src/lib/domaine/dates.ts';
import { anneeExerciceDe } from '../../src/lib/domaine/exercices.ts';
import { centimes } from '../../src/lib/domaine/montant.ts';
import type { EntreeCreation } from '../../src/lib/server/application/operations/index.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import {
	appliquerMigrations,
	chargerMigrations
} from '../../src/lib/server/infra/sqlite/migrateur.ts';

const c = centimes;
export const JETON_TRESORIER = 'session-fictive-tresorerie-etats';
export const JETON_LECTEUR = 'session-fictive-lecture-etats';

/** Le plus petit PDF qu'accepte le contrôle sur les octets. */
const PDF_FICTIF = new TextEncoder().encode('%PDF-1.4\n%fictif\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

function session(b: ReturnType<typeof ouvrirBase>, jeton: string, accesId: number) {
	const maintenant = new Date();
	const demain = new Date(maintenant.getTime() + 86_400_000).toISOString();
	b.prepare(
		`INSERT INTO session_connexion (hash_jeton, acces_id, cree_le, derniere_activite_le, expire_le)
		 VALUES (?, ?, ?, ?, ?)`
	).run(
		createHash('sha256').update(jeton).digest('hex'),
		accesId,
		maintenant.toISOString(),
		maintenant.toISOString(),
		demain
	);
}

export type JeuEtats = ReturnType<typeof preparerInstanceEtats>;

export function preparerInstanceEtats(dossier: string) {
	mkdirSync(dossier, { recursive: true });
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const maintenant = new Date().toISOString();
	appliquerMigrations(base, chargerMigrations('migrations'), { horodatage: maintenant });
	const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });

	const tresorierId = app.socle.depots.acces.creer({
		identifiant: 'tresorerie',
		nomAffiche: 'Camille Fictive',
		role: 'tresorier',
		hash: 'sans-objet-la-session-suffit',
		creeLe: maintenant
	});
	const lecteurId = app.socle.depots.acces.creer({
		identifiant: 'verification',
		nomAffiche: 'Dominique Fictive',
		role: 'lecteur',
		hash: 'sans-objet-la-session-suffit',
		creeLe: maintenant
	});
	session(base, JETON_TRESORIER, tresorierId);
	session(base, JETON_LECTEUR, lecteurId);
	const ctx = app.ctx({
		id: tresorierId,
		identifiant: 'tresorerie',
		nomAffiche: 'Camille Fictive',
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

	const aujourdhui = instantVersDate(maintenant);
	const annee = anneeExerciceDe(aujourdhui, 9);
	const ecoule = `${annee - 1}-${annee}`;
	const courant = `${annee}-${annee + 1}`;
	exiger(
		app.exercices.demarrer(ctx, {
			anneeDebut: annee - 1,
			comptes: [
				{ libelle: 'CCP imaginaire', type: 'banque', solde: c(2_400_00) },
				{ libelle: 'Livret imaginaire', type: 'epargne', solde: c(9_000_00) },
				{ libelle: 'Caisse de la fête', type: 'caisse', solde: c(80_00) }
			]
		})
	);
	exiger(app.exercices.ouvrirSuivant(ctx));
	const depot = app.socle.depots.parametrage;
	depot.definirEtapeAssistant(5);

	const groupe = (nom: string) => depot.groupes().find((g) => g.libelle === nom)!.id;
	const natures = {
		transport: 'Transport',
		buvette: 'Buvette',
		fournitures: 'Fournitures',
		subvention: 'Subvention',
		frais: 'Frais bancaires'
	};
	const grp = {
		transport: 'Fonctionnement',
		buvette: 'Évènements',
		fournitures: 'Fonctionnement',
		subvention: 'Subventions',
		frais: 'Fonctionnement'
	} as const;
	for (const [cle, libelle] of Object.entries(natures)) {
		exiger(
			app.parametrage.creerNature(ctx, {
				libelle,
				groupeId: groupe(grp[cle as keyof typeof grp]),
				neutre: false
			})
		);
	}
	for (const libelle of ['Kermesse', 'Sortie mer', 'Agrumes']) {
		exiger(
			app.parametrage.creerAction(ctx, {
				libelle,
				groupeId: groupe('Évènements'),
				avecCaisse: false
			})
		);
	}
	const nature = (nom: string) => depot.natures().find((n) => n.libelle === nom)!.id;
	const action = (nom: string) => depot.actions().find((a) => a.libelle === nom)!.id;
	const [ccp, livret, caisse] = depot.comptes().map((x) => x.id) as [number, number, number];
	const sommeARendre = depot.natures().find((n) => n.codeSysteme === 'somme_a_rendre')!.id;

	const ligne = (
		montant: number,
		nom: string | number,
		act: string | null,
		autres: { rattachement?: number; reduction?: boolean } = {}
	) => ({
		montant: c(montant),
		contraire: false,
		reduction: autres.reduction ?? false,
		natureId: typeof nom === 'number' ? nom : nature(nom),
		actionId: act === null ? null : action(act),
		exerciceRattachementId: autres.rattachement ?? null,
		note: null
	});

	function operation(
		intention: 'depense' | 'recette',
		date: string,
		libelle: string,
		lignes: ReturnType<typeof ligne>[],
		compteId = ccp
	) {
		return exiger(
			app.operations.creer(ctx, {
				forme: 'standard',
				intention,
				libelle,
				reference: null,
				modePaiement: 'virement',
				note: null,
				tiers: null,
				compteId,
				date,
				montant: c(lignes.reduce((t, l) => t + l.montant, 0)),
				lignes
			} as EntreeCreation)
		).id;
	}

	const exercice = (libelle: string) =>
		app.socle.depots.exercices.lister().find((e) => e.libelle === libelle)!;
	const debut = `${annee}-09-01`;
	const dernierJour = `${annee}-08-31`;

	// Exercice écoulé : de quoi avoir un résultat, des soldes qui s'enchaînent, une Pièce manquante.
	operation('recette', `${annee - 1}-10-10`, 'Subvention de la commune imaginaire', [
		ligne(1_200_00, 'Subvention', null)
	]);
	operation('depense', `${annee}-03-12`, 'Autocars du printemps', [
		ligne(450_00, 'Transport', 'Sortie mer')
	]);

	// Exercice courant : chaque ligne des états y figure au moins une fois.
	const autocars = operation('depense', ajouterJours(debut, 14), 'Autocars du Vallon', [
		ligne(600_00, 'Transport', 'Sortie mer'),
		ligne(400_00, 'Transport', 'Kermesse')
	]);
	operation('recette', ajouterJours(debut, 19), 'Buvette de rentrée', [
		ligne(1_850_50, 'Buvette', 'Kermesse')
	]);
	operation('recette', ajouterJours(debut, 21), 'Remboursement papeterie', [
		ligne(20_00, 'Fournitures', 'Kermesse', { reduction: true })
	]);
	operation('depense', ajouterJours(debut, 25), 'Frais de tenue de compte', [
		ligne(12_40, 'Frais bancaires', null)
	]);
	operation('recette', ajouterJours(debut, 28), 'Trop-perçu famille fictive', [
		ligne(35_00, sommeARendre, null)
	]);
	// Le paiement tardif de l'année passée.
	operation('depense', ajouterJours(debut, 30), 'Facture tardive des Agrumes', [
		ligne(120_00, 'Fournitures', 'Agrumes', { rattachement: exercice(ecoule).id })
	]);
	// Mouvement interne à cheval sur les deux Exercices.
	exiger(
		app.operations.creer(ctx, {
			forme: 'interne',
			libelle: 'Virement vers le livret',
			note: null,
			reference: null,
			deId: ccp,
			versId: livret,
			montant: c(300_00),
			parti: dernierJour,
			arrive: ajouterJours(debut, 1)
		} as EntreeCreation)
	);

	const piece = exiger(
		app.pieces.deposer(ctx, {
			nomOriginal: 'facture-autocars-fictive.pdf',
			octets: PDF_FICTIF,
			operationId: autocars
		})
	);

	exiger(
		app.creances.ajouter(ctx, {
			sens: 'creance',
			tiers: 'Commune imaginaire',
			motif: 'Subvention annuelle',
			montant: c(500_00),
			date: ajouterJours(debut, 10),
			actionId: null,
			note: null
		})
	);
	exiger(
		app.creances.ajouter(ctx, {
			sens: 'dette',
			tiers: 'Autocars du Vallon',
			motif: 'Solde de la sortie',
			montant: c(75_00),
			date: ajouterJours(debut, 12),
			actionId: null,
			note: null
		})
	);

	// Relevé : tout est pointé, sauf une ligne et une Opération. Leur différence fait l'Écart.
	const pointer = (
		compteId: number,
		coteId: number,
		montant: number,
		date: string,
		libelle: string
	) => {
		const l = exiger(
			app.pointage.saisirLigne(ctx, { compteId, date, montant: c(montant), libelle })
		);
		exiger(app.pointage.pointer(ctx, { compteId, coteIds: [coteId], ligneIds: [l.id] }));
	};
	const cotes = app.socle.depots.operations
		.journal()
		.operations.filter((o) => o.libelle !== 'Facture tardive des Agrumes')
		.flatMap((o) => o.cotes.map((x) => ({ ...x, libelle: o.libelle })));
	for (const x of cotes) pointer(x.compteId, x.id, x.montant, x.date, x.libelle.toUpperCase());
	const dateReleve = ajouterJours(aujourdhui, -5);
	exiger(
		app.pointage.saisirLigne(ctx, {
			compteId: ccp,
			date: ajouterJours(dateReleve, -1),
			montant: c(-25_00),
			libelle: 'PRLV ASSURANCE IMAGINAIRE'
		})
	);
	const solde = (compteId: number, depart: number) =>
		cotes.filter((x) => x.compteId === compteId).reduce((t, x) => t + x.montant, depart);
	exiger(
		app.pointage.saisirSolde(ctx, {
			compteId: ccp,
			date: dateReleve,
			solde: c(solde(ccp, 2_400_00) - 25_00)
		})
	);
	exiger(
		app.pointage.saisirSolde(ctx, {
			compteId: livret,
			date: dateReleve,
			solde: c(solde(livret, 9_000_00))
		})
	);
	const kermesse = action('Kermesse');
	base.close();
	return { ecoule, courant, ccp, livret, caisse, kermesse, piece: piece.id };
}
