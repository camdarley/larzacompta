/**
 * Jeu d'essai public : une APE imaginaire, chaque cas de l'analyse d'origine en version fictive,
 * avec ses résultats attendus au centime. Noms, montants et références sont inventés.
 * Complété par les stories suivantes.
 */
import { centimes } from '#lib/domaine/montant.ts';
import type { EntreeCreation } from '#lib/server/application/operations/index.ts';

const c = centimes;

export const PARAMETRES = {
	exercice: { anneeDebut: 2026, debut: '2026-09-01', fin: '2027-08-31' },
	comptes: [
		{ libelle: 'Banque des Tilleuls', type: 'banque' as const, solde: c(1_200_00) },
		{ libelle: 'Livret des Tilleuls', type: 'epargne' as const, solde: c(9_000_00) }
	],
	natures: ['Transport', 'Fournitures', 'Spectacle', 'Buvette', 'Cotisations'],
	actions: ['Sortie mer', 'Olympiades', 'Sortie ferme', 'Kermesse', 'Spectacle de Noël']
};

/** Résout les noms du jeu vers les identifiants de l'instance de test. */
export type Reperes = {
	banque: number;
	livret: number;
	nature(nom: string): number;
	action(nom: string): number;
	sommeARendre: number;
};

const enTete = { reference: null, modePaiement: null, note: null, tiers: null };

function ligne(montant: number, natureId: number, actionId: number | null, contraire = false) {
	return {
		montant: c(montant),
		contraire,
		reduction: false,
		natureId,
		actionId,
		exerciceRattachementId: null,
		note: null
	};
}

/** Chaque cas réel de l'analyse, dans l'ordre de l'année. */
export function saisiesFictives(r: Reperes): (EntreeCreation & { cas: string })[] {
	const transport = r.nature('Transport');
	return [
		{
			cas: 'FR-5 : facture d’autocars répartie sur trois Actions',
			forme: 'standard',
			...enTete,
			intention: 'depense',
			compteId: r.banque,
			date: '2026-09-15',
			libelle: 'Autocars du Vallon',
			reference: 'FA-FICTIVE-14',
			modePaiement: 'virement',
			montant: c(1_000_00),
			lignes: [
				ligne(600_00, transport, r.action('Sortie mer')),
				ligne(250_00, transport, r.action('Olympiades')),
				ligne(150_00, transport, r.action('Sortie ferme'))
			]
		},
		{
			cas: 'FR-4 : recette simple',
			forme: 'standard',
			...enTete,
			intention: 'recette',
			compteId: r.banque,
			date: '2026-09-20',
			libelle: 'Buvette de rentrée',
			montant: c(320_50),
			lignes: [ligne(320_50, r.nature('Buvette'), r.action('Kermesse'))]
		},
		{
			cas: 'FR-7 : virement vers le livret, à cheval sur deux jours',
			forme: 'interne',
			libelle: 'Virement vers le livret',
			note: null,
			reference: null,
			deId: r.banque,
			versId: r.livret,
			montant: c(200_00),
			parti: '2026-09-30',
			arrive: '2026-10-01'
		},
		{
			cas: 'FR-8 : dépense de 100 € remboursée de 20 €',
			forme: 'standard',
			...enTete,
			intention: 'depense',
			compteId: r.banque,
			date: '2026-10-05',
			libelle: 'Papeterie du Lac',
			montant: c(100_00),
			lignes: [ligne(100_00, r.nature('Fournitures'), r.action('Kermesse'))]
		},
		{
			cas: 'FR-8 : remboursement du fournisseur',
			forme: 'standard',
			...enTete,
			intention: 'recette',
			compteId: r.banque,
			date: '2026-10-12',
			libelle: 'Remboursement Papeterie du Lac',
			montant: c(20_00),
			lignes: [{ ...ligne(20_00, r.nature('Fournitures'), r.action('Kermesse')), reduction: true }]
		},
		{
			cas: 'FR-8 : trop-perçu reçu, sur la Nature neutre',
			forme: 'standard',
			...enTete,
			intention: 'recette',
			compteId: r.banque,
			date: '2026-10-20',
			libelle: 'Trop-perçu famille fictive',
			montant: c(100_00),
			lignes: [ligne(100_00, r.sommeARendre, null)]
		},
		{
			cas: 'FR-9 : photographe qui encaisse les ventes et facture le reste',
			forme: 'compensee',
			...enTete,
			compteId: r.banque,
			date: '2026-11-03',
			libelle: 'Photographe imaginaire',
			tiers: 'Photographe imaginaire',
			facture: c(500_00),
			ventes: c(300_00),
			ligneFacture: { natureId: r.nature('Spectacle'), actionId: r.action('Kermesse') },
			ligneVentes: { natureId: r.nature('Buvette'), actionId: r.action('Kermesse') }
		},
		{
			cas: 'FR-10 : cachet d’artiste',
			forme: 'standard',
			...enTete,
			intention: 'depense',
			compteId: r.banque,
			date: '2026-11-10',
			libelle: 'Cachet artiste',
			montant: c(220_00),
			lignes: [ligne(220_00, r.nature('Spectacle'), r.action('Spectacle de Noël'))]
		},
		{
			cas: 'FR-10 : cotisations du cachet',
			forme: 'standard',
			...enTete,
			intention: 'depense',
			compteId: r.banque,
			date: '2026-11-25',
			libelle: 'Cotisations artiste',
			montant: c(180_00),
			lignes: [ligne(180_00, r.nature('Cotisations'), r.action('Spectacle de Noël'))]
		}
	];
}

/** Résultats attendus au centime, une fois toutes les saisies enregistrées et le trop-perçu rendu. */
export const ATTENDUS = {
	/** 1 200,00 − 1 000,00 + 320,50 − 200,00 − 100,00 + 20,00 + 100,00 − 200,00 − 220,00 − 180,00 − 100,00 */
	soldeBanqueFin: c(-359_50),
	soldeLivretFin: c(9_200_00),
	/** Le virement est parti le 30 septembre, arrivé le 1er octobre. */
	soldeBanqueAu30Septembre: c(320_50),
	soldeLivretAu30Septembre: c(9_000_00),
	/** Remboursement rangé en Dépense : 100,00 − 20,00. */
	depenseNettePapeterie: c(80_00),
	/** Hors Nature neutre : le trop-perçu reçu puis rendu donne un résultat nul. */
	effetSommeARendre: c(0),
	/** Ventes 300,00 moins facture 500,00, un seul Côté. */
	differentielPhotographe: c(-200_00),
	coutSpectacle: c(400_00),
	/** 320,50 de buvette + 300,00 de ventes du photographe. */
	recettes: c(620_50),
	/** 1 000,00 d'autocars + 80,00 de papeterie nette + 500,00 de facture + 400,00 de spectacle. */
	depenses: c(1980_00),
	resultat: c(-1359_50),
	/** Le résultat : le trop-perçu est reçu puis rendu, le virement ne change rien au total. */
	variation: c(-1359_50),
	resultatParAction: {
		'Sortie mer': c(-600_00),
		Olympiades: c(-250_00),
		'Sortie ferme': c(-150_00),
		Kermesse: c(40_50),
		'Spectacle de Noël': c(-400_00)
	}
};

/**
 * Ce que `charger.ts` ajoute aux saisies ci-dessus, en plus des opérations de tous les jours.
 * Chaque cas de l'analyse d'origine couvert au jalon 1 s'y retrouve, avec ses chiffres au centime.
 */
export const JEU_COMPLET = {
	caisse: { libelle: 'Caisse de la fête', type: 'caisse' as const, solde: c(80_00) },
	/** Montant du dernier relevé de la Banque, un frais encore inconnu du cahier compris. */
	soldeReleve: c(2337_00),
	dateReleve: '2026-11-02',
	/** Frais lu sur le relevé et pas encore saisi : c'est l'Écart que le Tableau de contrôle montre. */
	ecartReleve: c(-3_50),
	/** La pile des Agrumes, reçue en janvier. Le dernier chèque attend encore sa Remise. */
	cheques: [
		{ emetteur: 'Famille Abricot', banque: 'Banque des Prés', montant: c(30_00) },
		{ emetteur: 'Famille Bergamote', banque: 'Banque des Prés', montant: c(45_00) },
		{ emetteur: 'Famille Cédrat', banque: 'Crédit du Vallon', montant: c(22_50) },
		{ emetteur: 'Famille Datte', banque: 'Crédit du Vallon', montant: c(60_00) },
		{ emetteur: 'Famille Églantine', banque: 'Banque des Prés', montant: c(80_00) }
	],
	numeroChequeEmis: '5000101',
	numeroFormuleAnnulee: '5000102',
	/** N° fictif lu au relevé, absent du registre : le Tableau de contrôle le signale. */
	numeroChequeAbsent: '5000999',
	sumup: { brut: c(200_00), frais: c(10_00), net: c(190_00) }
};

export const ATTENDUS_COMPLET = {
	/**
	 * −359,50 de base, −150,00 tardif, +60,00 de dépôt d'espèces, +400,00 de Créance, +2 000,00 de
	 * subvention, +157,50 de Remise, −45,00 de chèque rejeté, −75,00 de chèque émis, +190,00 de SumUp.
	 */
	soldeBanqueFin: c(2178_00),
	/** 9 200,00 + 120,00 de Remise + 20,00 d'espèces déposées. */
	soldeLivretFin: c(9340_00),
	/** 80,00 de départ, −60,00 et −20,00 déposés, +120,00 de buvette, −30,00 payés en espèces. */
	soldeCaisseFin: c(90_00),
	/** Le chèque de la Famille Églantine attend sa Remise. */
	chequesARemettre: c(80_00),
	/**
	 * 620,50 + 120,00 de buvette en espèces + 2 000,00 de subvention
	 * + 357,50 de chèques − 45,00 de rejet + 200,00 de brut SumUp.
	 */
	recettes: c(3253_00),
	/** 1 980,00 + 30,00 de fournitures en espèces + 75,00 de chèque émis + 10,00 de frais SumUp. */
	depenses: c(2095_00),
	resultat: c(1158_00),
	/** +400,00 de Créance de 2025-2026 encaissée, −150,00 de facture tardive de 2025-2026. */
	resultatAnterieurs: c(250_00),
	/** Résultat + rattachements. */
	variation: c(1408_00),
	/** 130,50 de base + 20,00 du chèque ventilé. */
	resultatKermesse: c(150_50),
	/** Dette reprise de 2025-2026, toujours due. */
	dettesRestantes: c(90_00),
	creancesRestantes: c(0)
};
