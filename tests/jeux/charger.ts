import { hacherSansAttendre } from '#lib/server/infra/auth/mot-de-passe.ts';
/**
 * Charge l'Exercice fictif complet par les vrais cas d'usage, dans une instance donnée
 * ou dans un dossier neuf. Aucun nom, IBAN ni n° de chèque réel.
 * Nature des données : `exercice-fictif.ts`. Résultats attendus : `ATTENDUS_COMPLET`.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Instant } from '#lib/domaine/dates.ts';
import { centimes, type Centimes } from '#lib/domaine/montant.ts';
import type { EntreeCreation } from '#lib/server/application/operations/index.ts';
import type { Ctx } from '#lib/server/application/executer.ts';
import { composer, type Application } from '#lib/server/composition.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { appliquerMigrations, chargerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';
import { JEU_COMPLET, PARAMETRES, saisiesFictives, type Reperes } from './exercice-fictif.ts';
import { ofxCp1252, ofxTexte, type LigneOfx } from './releve-fictif.ts';

const c = centimes;

/** Comptes de démonstration : le jeu sert aussi à regarder et à essayer l'outil. */
export const COMPTES_FICTIFS = {
	tresorier: {
		identifiant: 'camille',
		nom: 'Camille Fictive',
		motDePasse: 'cahier de comptes fictif'
	},
	lecteur: {
		identifiant: 'dominique',
		nom: 'Dominique Fictive',
		motDePasse: 'relecture des comptes fictive'
	}
};

const PDF_FICTIF = new TextEncoder().encode('%PDF-1.4\n%fictif\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(`Jeu fictif : ${r.erreur.code}`);
	return r.valeur;
}

const LIGNE = { contraire: false, reduction: false, exerciceRattachementId: null, note: null };

const standard = (e: {
	intention: 'depense' | 'recette';
	compteId: number;
	date: string;
	libelle: string;
	lignes: {
		montant: Centimes;
		natureId: number;
		actionId: number | null;
		exerciceRattachementId?: number;
	}[];
}) =>
	({
		forme: 'standard',
		reference: null,
		modePaiement: 'virement',
		note: null,
		tiers: null,
		...e,
		montant: c(e.lignes.reduce((t, l) => t + l.montant, 0)),
		lignes: e.lignes.map((l) => ({ ...LIGNE, ...l }))
	}) as Extract<EntreeCreation, { forme: 'standard' }>;

export type JeuCharge = Reperes & {
	caisse: number;
	kermesse: number;
	exercice: { courant: number; repere: number };
};

export function chargerJeu(app: Application, ctx: Ctx): JeuCharge {
	exiger(
		app.parametrage.enregistrerAssociation(ctx, {
			nom: 'APE des Tilleuls',
			adresse: '1 rue imaginaire, 00000 Fictiveville',
			moisDebutExercice: 9,
			mentionsFacture: ''
		})
	);
	// FR-40 : l'année s'ouvre depuis une Balance au 1er septembre.
	exiger(
		app.exercices.demarrer(ctx, {
			anneeDebut: PARAMETRES.exercice.anneeDebut,
			comptes: [...PARAMETRES.comptes, JEU_COMPLET.caisse].map(({ libelle, type, solde }) => ({
				libelle,
				type,
				solde
			}))
		})
	);
	const depot = app.socle.depots.parametrage;
	depot.definirEtapeAssistant(5);
	const groupes = depot.groupes();
	const groupeDe = (nom: string) => groupes.find((g) => g.libelle === nom)?.id ?? groupes[0]!.id;
	for (const libelle of [...PARAMETRES.natures, 'Subventions', 'Ventes', 'Frais bancaires']) {
		const groupeId = groupeDe(libelle === 'Subventions' ? 'Subventions' : 'Fonctionnement');
		exiger(app.parametrage.creerNature(ctx, { libelle, groupeId, neutre: false }));
	}
	for (const libelle of [...PARAMETRES.actions, 'Agrumes']) {
		exiger(
			app.parametrage.creerAction(ctx, {
				libelle,
				groupeId: groupeDe('Évènements'),
				avecCaisse: libelle === 'Kermesse'
			})
		);
	}

	const nature = (nom: string) => depot.natures().find((n) => n.libelle === nom)!.id;
	const action = (nom: string) => depot.actions().find((a) => a.libelle === nom)!.id;
	const [banque, livret, caisse] = depot.comptes().map((x) => x.id) as [number, number, number];
	const reperes: Reperes = {
		banque,
		livret,
		nature,
		action,
		sommeARendre: depot.natures().find((n) => n.codeSysteme === 'somme_a_rendre')!.id
	};
	const exercices = app.socle.depots.exercices.lister();
	const courant = exercices.find((e) => e.statut === 'ouvert')!.id;
	const repere = exercices.find((e) => e.statut === 'repere')!.id;

	// FR-40 : les sommes de l'année passée, reprises à l'ouverture.
	const creanceReprise = exiger(
		app.creances.ajouter(ctx, {
			sens: 'creance',
			tiers: 'Mairie imaginaire',
			motif: 'Subvention 2025-2026',
			montant: c(400_00),
			date: '2026-08-31',
			actionId: null,
			note: null
		})
	).id;
	exiger(
		app.creances.ajouter(ctx, {
			sens: 'dette',
			tiers: 'Imprimerie imaginaire',
			motif: 'Affiches de la fête 2026',
			montant: c(90_00),
			date: '2026-08-31',
			actionId: null,
			note: null
		})
	);

	const creer = (e: EntreeCreation) => exiger(app.operations.creer(ctx, e)).id;
	const ids = new Map(saisiesFictives(reperes).map((s) => [s.cas, creer(s)]));
	const idDe = (debut: string) => [...ids].find(([cas]) => cas.startsWith(debut))![1];

	creer({
		...standard({
			intention: 'depense',
			compteId: banque,
			date: '2026-11-30',
			libelle: 'Trop-perçu rendu',
			lignes: [{ montant: c(100_00), natureId: reperes.sommeARendre, actionId: null }]
		}),
		rendDe: idDe('FR-8 : trop-perçu')
	} as EntreeCreation);

	// FR-10 : une dépense payée en deux fois.
	exiger(
		app.operations.relier(ctx, {
			id: idDe('FR-10 : cachet'),
			autreId: idDe('FR-10 : cotisations'),
			libelle: 'Spectacle'
		})
	);

	creer(
		standard({
			intention: 'recette',
			compteId: banque,
			date: '2026-10-25',
			libelle: 'Subvention de la commune imaginaire',
			lignes: [{ montant: c(2_000_00), natureId: nature('Subventions'), actionId: null }]
		})
	);
	// Une facture de l'an passé, payée cette année : hors du résultat de 2026-2027.
	creer(
		standard({
			intention: 'depense',
			compteId: banque,
			date: '2026-12-05',
			libelle: 'Facture tardive du traiteur',
			lignes: [
				{
					montant: c(150_00),
					natureId: nature('Buvette'),
					actionId: action('Kermesse'),
					exerciceRattachementId: repere
				}
			]
		})
	);
	// Espèces : la recette d'un évènement, une dépense payée dessus, puis le dépôt en banque.
	creer(
		standard({
			intention: 'recette',
			compteId: caisse,
			date: '2026-12-12',
			libelle: 'Buvette du marché de Noël',
			lignes: [{ montant: c(120_00), natureId: nature('Buvette'), actionId: action('Kermesse') }]
		})
	);
	creer(
		standard({
			intention: 'depense',
			compteId: caisse,
			date: '2026-12-12',
			libelle: 'Gobelets payés en espèces',
			lignes: [{ montant: c(30_00), natureId: nature('Fournitures'), actionId: action('Kermesse') }]
		})
	);
	creer({
		forme: 'interne',
		libelle: 'Dépôt d’espèces',
		note: null,
		reference: null,
		deId: caisse,
		versId: banque,
		montant: c(60_00),
		parti: '2026-12-14',
		arrive: '2026-12-14'
	} as EntreeCreation);

	exiger(
		app.creances.solder(ctx, {
			parts: [{ creanceId: creanceReprise, montant: c(400_00) }],
			saisie: standard({
				intention: 'recette',
				compteId: banque,
				date: '2026-12-20',
				libelle: 'Subvention 2025-2026 encaissée',
				lignes: [
					{
						montant: c(400_00),
						natureId: nature('Subventions'),
						actionId: null,
						exerciceRattachementId: repere
					}
				]
			})
		})
	);

	exiger(
		app.pieces.deposer(ctx, {
			nomOriginal: 'facture-autocars-fictive.pdf',
			octets: PDF_FICTIF,
			operationId: idDe('FR-5')
		})
	);

	pointerReleve(app, ctx, banque, livret);
	chargerChequesEtSumup(app, ctx, { banque, livret, caisse, nature, action });
	return { ...reperes, caisse, kermesse: action('Kermesse'), exercice: { courant, repere } };
}

/**
 * Jalon 2 : la pile des Agrumes, sa Remise, un rejet, le registre des chèques émis, un versement
 * SumUp, puis une Remise et un dépôt d'espèces vers le livret. Tout est daté après le relevé.
 */
function chargerChequesEtSumup(
	app: Application,
	ctx: Ctx,
	r: Pick<Reperes, 'banque' | 'livret' | 'nature' | 'action'> & { caisse: number }
) {
	const ventes = r.nature('Ventes');
	const agrumes = r.action('Agrumes');
	const ligne = (montant: Centimes, actionId: number | null = agrumes) => ({
		...LIGNE,
		montant,
		natureId: ventes,
		actionId
	});
	const recu = (e: { emetteur: string; banque: string; montant: Centimes }, date: string) =>
		exiger(
			app.cheques.enregistrerRecu(ctx, {
				...e,
				numero: null,
				date,
				lignes:
					// Un chèque peut couvrir plusieurs Actions (FR-21).
					e.montant === c(60_00)
						? [ligne(c(40_00)), ligne(c(20_00), r.action('Kermesse'))]
						: [ligne(e.montant)]
			})
		).id;
	const ids = JEU_COMPLET.cheques.map((x) => recu(x, '2027-01-12'));
	const remis = ids.slice(0, 4);
	exiger(
		app.cheques.creerRemise(ctx, {
			chequeIds: remis,
			compteId: r.banque,
			date: '2027-01-15',
			total: c(157_50)
		})
	);
	exiger(app.cheques.rejeter(ctx, { id: ids[1]!, date: '2027-01-25' }));

	exiger(
		app.operations.creer(ctx, {
			...standard({
				intention: 'depense',
				compteId: r.banque,
				date: '2027-01-20',
				libelle: 'Location de la salle imaginaire',
				lignes: [
					{
						montant: c(75_00),
						natureId: r.nature('Spectacle'),
						actionId: r.action('Spectacle de Noël')
					}
				]
			}),
			modePaiement: 'cheque',
			reference: JEU_COMPLET.numeroChequeEmis,
			tiers: 'Salle imaginaire'
		} as EntreeCreation)
	);
	exiger(
		app.cheques.annulerFormule(ctx, {
			numero: JEU_COMPLET.numeroFormuleAnnulee,
			beneficiaire: null
		})
	);

	const { brut, frais, net } = JEU_COMPLET.sumup;
	const ligneSumup = exiger(
		app.pointage.saisirLigne(ctx, {
			compteId: r.banque,
			date: '2027-01-31',
			montant: net,
			libelle: 'VIREMENT SUMUP PAYOUT'
		})
	);
	exiger(
		app.pointage.creerDepuisLigne(ctx, {
			ligneId: ligneSumup.id,
			saisie: {
				...standard({
					intention: 'recette',
					compteId: r.banque,
					date: '2027-01-31',
					libelle: 'Versement SumUp',
					lignes: []
				}),
				modePaiement: 'sumup',
				montant: net,
				lignes: [
					ligne(brut),
					{ ...ligne(frais, null), contraire: true, natureId: r.nature('Frais bancaires') }
				]
			}
		})
	);

	const livre = recu(
		{ emetteur: 'Famille Figue', banque: 'Banque des Prés', montant: c(120_00) },
		'2027-02-01'
	);
	exiger(
		app.cheques.creerRemise(ctx, {
			chequeIds: [livre],
			compteId: r.livret,
			date: '2027-02-01',
			total: c(120_00)
		})
	);
	exiger(
		app.operations.creer(ctx, {
			forme: 'interne',
			libelle: 'Dépôt d’espèces sur le livret',
			note: null,
			reference: null,
			deId: r.caisse,
			versId: r.livret,
			montant: c(20_00),
			parti: '2027-02-02',
			arrive: '2027-02-02'
		} as EntreeCreation)
	);
	exiger(
		app.pointage.saisirLigne(ctx, {
			compteId: r.banque,
			date: '2027-02-03',
			montant: c(-35_00),
			libelle: `CHEQUE N ${JEU_COMPLET.numeroChequeAbsent}`
		})
	);
}

/** Le relevé d'octobre : tout se pointe, sauf un frais que le cahier ne connaît pas encore. */
function pointerReleve(app: Application, ctx: Ctx, banque: number, livret: number) {
	const j = () => app.socle.depots.operations.journal();
	const cotes = j()
		.operations.flatMap((o) => o.cotes.map((x) => ({ ...x, libelle: o.libelle })))
		.filter((x) => x.compteId === banque && x.date <= '2026-10-31');
	const jour = (d: string) => d.replaceAll('-', '');
	const lignes: LigneOfx[] = cotes.map((x, i) => ({
		date: jour(x.date),
		montant: (x.montant / 100).toFixed(2),
		id: `FICTIF${String(i + 1).padStart(4, '0')}`,
		libelle: x.libelle.toUpperCase().replaceAll('’', ' ')
	}));
	lignes.push({
		date: jour(JEU_COMPLET.dateReleve),
		montant: (JEU_COMPLET.ecartReleve / 100).toFixed(2),
		id: 'FICTIF9999',
		libelle: 'FRAIS TENUE DE COMPTE'
	});
	const r = exiger(
		app.pointage.importer(ctx, {
			compteId: banque,
			nomFichier: 'releve-fictif.ofx',
			octets: ofxCp1252(
				ofxTexte(lignes, {
					montant: (JEU_COMPLET.soldeReleve / 100).toFixed(2),
					date: jour(JEU_COMPLET.dateReleve)
				})
			)
		})
	);
	if ('type' in r && r.type === 'correspondance') throw new Error('Jeu fictif : relevé non lu');

	const nouvelles = j().lignesReleve.filter((l) => l.compteId === banque);
	for (const cote of cotes) {
		const ligne = nouvelles.find((l) => l.date === cote.date && l.montant === cote.montant);
		exiger(
			app.pointage.pointer(ctx, { compteId: banque, coteIds: [cote.id], ligneIds: [ligne!.id] })
		);
	}

	const virement = j()
		.operations.flatMap((o) => o.cotes)
		.find((x) => x.compteId === livret)!;
	const ligneLivret = exiger(
		app.pointage.saisirLigne(ctx, {
			compteId: livret,
			date: virement.date,
			montant: virement.montant,
			libelle: 'VIREMENT RECU DU CCP'
		})
	);
	exiger(
		app.pointage.pointer(ctx, {
			compteId: livret,
			coteIds: [virement.id],
			ligneIds: [ligneLivret.id]
		})
	);
	exiger(
		app.pointage.saisirSolde(ctx, { compteId: livret, date: '2026-10-31', solde: c(9_200_00) })
	);
}

export type OptionsDossier = {
	/** Horloge du chargement, pour des données indépendantes du jour où le jeu se charge. */
	maintenant?: Instant;
	migrations?: string;
	/** Clôt l'Exercice : l'empreinte de clôture entre alors dans ce que `ape verifier` rejoue. */
	cloturer?: boolean;
};

/** Une instance fictive complète, prête à servir : `base.sqlite` et `fichiers/`. */
export function chargerDansDossier(dossier: string, options: OptionsDossier = {}) {
	mkdirSync(dossier, { recursive: true });
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const maintenant = options.maintenant ?? '2026-11-05T10:00:00.000Z';
	appliquerMigrations(base, chargerMigrations(options.migrations ?? 'migrations'), {
		horodatage: maintenant
	});
	const app = composer({
		base,
		horloge: { maintenant: () => maintenant },
		fichiers: creerFichiers(join(dossier, 'fichiers')),
		journaliseur: { info() {}, erreur() {} }
	});
	const { tresorier, lecteur } = COMPTES_FICTIFS;
	const creerAcces = (a: typeof tresorier, role: 'tresorier' | 'lecteur') =>
		app.socle.depots.acces.creer({
			identifiant: a.identifiant,
			nomAffiche: a.nom,
			role,
			hash: hacherSansAttendre(a.motDePasse),
			creeLe: maintenant
		});
	const id = creerAcces(tresorier, 'tresorier');
	creerAcces(lecteur, 'lecteur');
	const ctx = app.ctx({
		id,
		identifiant: tresorier.identifiant,
		nomAffiche: tresorier.nom,
		role: 'tresorier',
		preferences: { theme: 'systeme', raccourcis: true }
	});
	const jeu = chargerJeu(app, ctx);
	if (options.cloturer) exiger(app.exercices.cloturer(ctx, jeu.exercice.courant));
	base.close();
	return jeu;
}
