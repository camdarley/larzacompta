/** Aide locale (FR-42). Un article par état livré, le Glossaire complet, sans lien externe. */
export type Article = { id: string; titre: string; paragraphes: string[] };

export const ARTICLES: readonly Article[] = [
	{
		id: 'demarrer',
		titre: 'Préparer son cahier',
		paragraphes: [
			'L’assistant de démarrage décrit votre APE, vos Comptes et leurs soldes de départ, puis vos Natures et vos Actions. Vous pouvez le quitter et le reprendre : il repart où vous en étiez.',
			'Les soldes de départ se lisent sur le relevé de la fin de l’Exercice précédent. Une caisse se compte à la main.'
		]
	},
	{
		id: 'exercices',
		titre: 'Exercices',
		paragraphes: [
			'Un Exercice est ouvert tant qu’on peut y enregistrer des Opérations. Deux Exercices peuvent être ouverts en même temps, pendant la période où l’année se termine alors que la suivante a commencé.',
			'Un Exercice repère n’a pas de dates : il permet seulement de rattacher une dépense à une année passée, tenue ailleurs.',
			'Le sélecteur d’Exercice change ce que vous regardez, sans quitter l’écran.'
		]
	},
	{
		id: 'acces',
		titre: 'Accès',
		paragraphes: [
			'Pour transmettre la trésorerie, créez un Accès : un lien à usage unique s’affiche une seule fois, à copier et à envoyer à la personne. Il reste valable 7 jours.',
			'Il n’y a pas de récupération par e-mail. Un mot de passe perdu se réinitialise par la personne qui gère l’installation.'
		]
	},
	{
		id: 'journal',
		titre: 'Journal des modifications',
		paragraphes: [
			'Le Journal note qui a fait quoi, et quand. Personne ne peut le modifier, pas même l’outil.'
		]
	}
];

export type Terme = { terme: string; ancre: string; definition: string };

/** Repris du Glossaire du PRD (§3). */
export const GLOSSAIRE: readonly Terme[] = [
	{
		terme: 'Exercice',
		ancre: 'exercice',
		definition:
			'Période comptable, ici du 1er septembre au 31 août. Ouvert ou clôturé. Un Exercice antérieur peut n’exister que comme repère, sans Opérations.'
	},
	{
		terme: 'Compte',
		ancre: 'compte',
		definition:
			'Lieu où se trouve la trésorerie : banque, épargne, caisse, chèques à remettre. Le solde d’une caisse ne compte que les espèces.'
	},
	{
		terme: 'Opération',
		ancre: 'operation',
		definition:
			'Fait financier daté, enregistré sur un Compte et réparti sur une ou plusieurs Lignes.'
	},
	{
		terme: 'Ligne',
		ancre: 'ligne',
		definition:
			'Part d’une Opération, portant un montant, une Nature, un Exercice de rattachement et, si besoin, une Action.'
	},
	{
		terme: 'Nature',
		ancre: 'nature',
		definition: 'Catégorie de recette ou de dépense : transport, subvention, intérêts…'
	},
	{
		terme: 'Action',
		ancre: 'action',
		definition:
			'Activité dont on veut connaître le résultat : Kermesse, Agrumes, Sortie… Peut être un évènement avec caisse.'
	},
	{
		terme: 'Groupe',
		ancre: 'groupe',
		definition:
			'Bloc d’un état, regroupant des Actions ou des Natures : Évènements, Subventions, Fonctionnement, Maternelle…'
	},
	{
		terme: 'Mouvement interne',
		ancre: 'mouvement-interne',
		definition:
			'Opération entre deux Comptes, exclue du résultat et portant une date par Compte : virement vers le livret, dépôt d’espèces, transfert entre caisses, Remise.'
	},
	{
		terme: 'Opération compensée',
		ancre: 'operation-compensee',
		definition:
			'Recette et dépense enregistrées sans mouvement de trésorerie, leur différence seule passant par un Compte.'
	},
	{
		terme: 'Ligne de relevé',
		ancre: 'ligne-de-releve',
		definition: 'Ligne importée d’un relevé, ou saisie à la main s’il n’existe aucun export.'
	},
	{
		terme: 'Pointage',
		ancre: 'pointage',
		definition:
			'Lien validé entre une ou plusieurs Lignes de relevé et une ou plusieurs Opérations, ou un côté de Mouvement interne.'
	},
	{
		terme: 'Session de caisse',
		ancre: 'session-de-caisse',
		definition:
			'Période d’utilisation d’une caisse, de l’ouverture à la clôture, rattachée à une Action si elle sert un évènement.'
	},
	{
		terme: 'Fond de caisse',
		ancre: 'fond-de-caisse',
		definition: 'Montant d’espèces au début d’une Session de caisse.'
	},
	{
		terme: 'Comptage',
		ancre: 'comptage',
		definition: 'Décompte daté des espèces d’une caisse, par billets et pièces.'
	},
	{
		terme: 'Recette d’espèces',
		ancre: 'recette-especes',
		definition:
			'Montant déduit à la clôture : Comptage final − Fond de caisse + dépenses en espèces + transferts sortants − transferts entrants.'
	},
	{
		terme: 'Écart',
		ancre: 'ecart',
		definition: 'Différence entre le solde calculé d’un Compte et son solde constaté.'
	},
	{
		terme: 'Écart de caisse',
		ancre: 'ecart-caisse',
		definition:
			'Écart constaté sur une caisse lorsque son solde n’aurait pas dû changer : entre deux Sessions, ou sur la caisse de réserve.'
	},
	{
		terme: 'Chèque reçu',
		ancre: 'cheque-recu',
		definition:
			'Chèque reçu en paiement par l’APE, enregistré comme recette à sa réception. États : en attente, remis, pointé, rejeté.'
	},
	{
		terme: 'Remise',
		ancre: 'remise',
		definition:
			'Mouvement interne qui transfère des Chèques reçus vers un Compte banque ou épargne, avec son bordereau.'
	},
	{
		terme: 'Chèque émis',
		ancre: 'cheque-emis',
		definition: 'Chèque payé par l’APE. États : émis, annulé, pointé.'
	},
	{
		terme: 'Créance, Dette',
		ancre: 'creance-dette',
		definition: 'Somme à encaisser ou à payer, pas encore réglée.'
	},
	{
		terme: 'Pièce',
		ancre: 'piece',
		definition: 'Justificatif joint : facture, reçu, relevé.'
	},
	{
		terme: 'Facture émise',
		ancre: 'facture-emise',
		definition: 'Facture produite par l’APE pour un tiers.'
	},
	{ terme: 'Avoir', ancre: 'avoir', definition: 'Document qui annule une Facture émise.' },
	{
		terme: 'Budget',
		ancre: 'budget',
		definition: 'Montants prévus par Action et par Nature pour un Exercice.'
	},
	{
		terme: 'Balance d’ouverture',
		ancre: 'balance-ouverture',
		definition: 'Solde par Compte, et Créances et Dettes en cours, au début d’un Exercice.'
	},
	{
		terme: 'Accès',
		ancre: 'acces',
		definition: 'Identifiant d’une personne, associé à un rôle.'
	},
	{
		terme: 'Compte de résultat, État de trésorerie, Document d’AG',
		ancre: 'etats',
		definition: 'États calculés. Le Document d’AG réunit les deux premiers.'
	}
];

/** Raccourcis livrés. Les autres arrivent avec leur fonction. */
export const RACCOURCIS: readonly { touche: string; effet: string }[] = [
	{ touche: 'Échap', effet: 'Ferme la couche du dessus' }
];
