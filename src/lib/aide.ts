/** Aide locale (FR-42). Un article par état livré, le Glossaire complet, sans lien externe. */
export type Article = { id: string; titre: string; paragraphes: string[] };

export const ARTICLES: readonly Article[] = [
	{
		id: 'demarrer',
		titre: 'Préparer son cahier',
		paragraphes: [
			'L’assistant de démarrage décrit votre APE, vos Comptes et leurs soldes de départ, vos Natures et vos Actions, puis les sommes encore dues de l’année passée. Vous pouvez le quitter et le reprendre : il repart où vous en étiez.',
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
			'Il n’y a pas de récupération par e-mail. Un mot de passe perdu se réinitialise par la personne qui gère l’installation.',
			'Trois rôles existent. Trésorerie tient les comptes et les Réglages. Comptage saisit les Comptages des caisses autorisées, sur téléphone. Lecture convient à un membre du bureau ou à une personne chargée de vérifier les comptes : elle consulte Tableau de contrôle, Opérations, Pièces, Actions, États, Journal, Caisses, Chèques, Créances et Dettes.',
			'Un Accès en lecture ne peut rien modifier. Il montre les mêmes écrans, sans bouton d’action. Le Pointage, le Budget, les Factures et les Réglages ne lui sont pas ouverts : leurs chiffres utiles restent visibles dans les états.'
		]
	},
	{
		id: 'operations',
		titre: 'Saisir une Opération',
		paragraphes: [
			'Partez de ce que vous voulez faire : Dépense, Recette, Entre Comptes, ou Autre. Aucun signe à saisir, l’outil sait dans quel sens va l’argent.',
			'Un montant accepte une addition : 220+180 donne 400,00 €. Dans une Ligne, la touche = insère ce qu’il reste à répartir.',
			'« Enregistrer et continuer » rouvre un formulaire vide, avec la même date et le même Compte : pratique pour une pile de tickets.'
		]
	},
	{
		id: 'repartir',
		titre: 'Répartir sur plusieurs Lignes',
		paragraphes: [
			'Une facture peut concerner plusieurs Actions : répartissez-la en Lignes. Tant que la somme des Lignes n’égale pas le montant, le reste s’affiche et rien ne s’enregistre.',
			'Une Ligne de sens contraire réduit une dépense : c’est le cas d’un avoir sur une facture. Une Ligne sans Action est permise : le fonctionnement courant n’en a pas besoin.',
			'Une Ligne peut se rattacher à un Exercice antérieur, par exemple un paiement tardif. Elle compte dans l’Exercice où l’argent a bougé, dans un bloc à part.'
		]
	},
	{
		id: 'autres-operations',
		titre: 'Les cas particuliers',
		paragraphes: [
			'Entre Comptes : un virement vers le livret ou un dépôt d’espèces. L’argent change de place, sans recette ni dépense. Chaque côté a sa date.',
			'Remboursement d’un fournisseur : retrouvez la dépense d’origine, indiquez le montant reçu. La dépense de l’Action diminue d’autant.',
			'Somme à rendre : un trop-perçu reçu puis rendu. Le résultat ne bouge pas. « Rendre cette somme » prépare la sortie et relie les deux Opérations.',
			'Opération compensée : le fournisseur a encaissé des ventes pour vous, et ne facture que la différence. L’Action voit la facture et les ventes, le Compte seulement le différentiel.',
			'Paiement en plusieurs fois : reliez les Opérations avec « Relier à une autre Opération ». Chacune affiche le total. L’outil ne calcule et ne déclare aucune cotisation.'
		]
	},
	{
		id: 'retrouver',
		titre: 'Retrouver une Opération',
		paragraphes: [
			'La recherche couvre le libellé, la référence, les notes et les montants, y compris ceux des Lignes. Les filtres se combinent et restent dans l’adresse de la page, à partager ou à recharger.',
			'« Exporter en CSV » donne exactement le résultat affiché, une rangée par Ligne, lisible dans un tableur.'
		]
	},
	{
		id: 'corriger',
		titre: 'Corriger ou annuler',
		paragraphes: [
			'Une Opération se corrige tant que son Exercice est ouvert. Son bloc Historique garde chaque modification.',
			'« Annuler l’Opération » la sort des soldes et des états. Elle reste visible, avec son état, et le Journal en garde la trace.',
			'Une Opération pointée garde son montant et son Compte. Son libellé et sa note restent modifiables.',
			'Dans un Exercice clôturé, rien ne change plus. Pour corriger, créez une nouvelle Opération dans un Exercice ouvert.'
		]
	},
	{
		id: 'etats-operation',
		titre: 'Ce que disent les pastilles',
		paragraphes: [
			'Pointé : l’Opération est reliée à une ligne de votre relevé. À pointer : pas encore.',
			'Clôturé : l’Exercice de l’Opération est clôturé, elle ne change plus. « Sur 2025-2026 » : une Ligne est rattachée à cet Exercice antérieur.',
			'Suggestion : l’outil propose une Nature et une Action d’après une Opération semblable. Tab accepte, taper remplace.'
		]
	},
	{
		id: 'importer',
		titre: 'Importer un relevé',
		paragraphes: [
			'Déposez le fichier OFX ou CSV téléchargé depuis votre banque dans la page Pointage. Réimportez sans crainte : une ligne déjà connue n’est jamais ajoutée deux fois, même si deux fichiers se chevauchent.',
			'Pour un CSV, indiquez une fois les colonnes de votre fichier. Le réglage reste retenu pour ce Compte. Si votre banque change ses colonnes, l’outil le dit et vous les redemande.',
			'Deux lignes identiques sont À regarder : même date, même montant, même libellé. Gardez-les si ce sont deux mouvements réels, écartez celle qui est en trop.',
			'Sans fichier à importer, « Saisir une ligne » recopie une ligne de votre relevé à la main. Elle se pointe comme les autres.'
		]
	},
	{
		id: 'pointer',
		titre: 'Pointer un relevé',
		paragraphes: [
			'Pointer, c’est relier une ligne de votre relevé à l’Opération qui lui correspond. L’outil propose, vous décidez : rien n’est jamais pointé sans votre geste.',
			'Chaque proposition dit pourquoi elle apparaît. Si elle repose sur un n° de facture ou un montant unique, elle est déjà sélectionnée : Entrée la valide, et la ligne suivante s’active. Le message « Pointé. Annuler » permet de revenir en arrière aussitôt.',
			'Rien ne correspond ? La touche c crée l’Opération depuis la ligne, sans ressaisir la date, le montant et le libellé. La touche r cherche une Opération non proposée. Espace coche plusieurs éléments pour relier une ligne à plusieurs Opérations, ou l’inverse.',
			'Une différence de quelques centimes se traite avec « Créer un ajustement » : une petite Opération couvre l’écart et entre dans le Pointage.',
			'Une Opération pointée garde son montant et son Compte. Pour les changer, annulez d’abord le Pointage depuis la file ou depuis l’Opération.'
		]
	},
	{
		id: 'ecart',
		titre: 'Comprendre un Écart',
		paragraphes: [
			'L’Écart compare le solde du relevé au solde calculé par l’outil, à la date du relevé. À 0,00 €, vos Opérations et la banque disent la même chose, au centime.',
			'Un clic sur l’Écart ouvre ses causes : les Lignes de relevé et les Opérations non pointées, et la somme qu’elles expliquent. Une Opération non pointée plus ancienne que le dernier relevé est à regarder en premier.',
			'Si votre fichier ne donne pas de solde, l’outil vous le demande : recopiez celui de votre relevé.'
		]
	},
	{
		id: 'creances-dettes',
		titre: 'Créances et Dettes',
		paragraphes: [
			'Une Créance est une somme que l’on doit à l’APE, une Dette une somme que l’APE doit. Un remboursement de bénévole en attente se saisit comme une Dette.',
			'Une somme en attente ne compte ni en recette, ni en dépense : seule l’Opération qui la solde touche le résultat et la trésorerie.',
			'« Solder » ouvre une Opération préremplie. Un paiement partiel laisse le reste dû visible, et une même Opération peut solder plusieurs sommes.',
			'Si l’Opération qui solde une somme est annulée, le reste dû remonte.',
			'Une somme de l’an passé, reprise à l’assistant, se rattache à son Exercice d’origine au moment du paiement : elle ne compte pas dans le résultat de l’Exercice en cours.'
		]
	},
	{
		id: 'pieces',
		titre: 'Pièces',
		paragraphes: [
			'Une Pièce est le justificatif d’une Opération : facture, reçu, photo de ticket. Un PDF ou une image de 20 Mo au plus.',
			'L’onglet Manquantes liste les dépenses sans Pièce. « Pas besoin de Pièce » en retire une dépense qui n’en demande pas, des frais bancaires par exemple.',
			'Une même Pièce peut justifier plusieurs Opérations : déposer deux fois le même fichier ne crée pas de doublon.',
			'Une Pièce rattachée se retire, mais son fichier reste. Sur un Exercice clôturé, joindre une Pièce reste possible : cela ne change aucun chiffre.'
		]
	},
	{
		id: 'photo',
		titre: 'Photographier un ticket',
		paragraphes: [
			'Sur téléphone, l’entrée Photo ouvre l’appareil. Choisissez ensuite la dépense, ou « Rattacher plus tard » : la photo attend dans Pièces, onglet Toutes.',
			'La photo est réduite avant l’envoi, ce qui retire sa position et ses autres métadonnées.'
		]
	},
	{
		id: 'caisses',
		titre: 'Caisses',
		paragraphes: [
			'Une caisse est un Compte qui se compte à la main. La page Caisses réunit le total des espèces et, pour chaque caisse, son solde courant et la date de son dernier Comptage.',
			'Le solde courant part du dernier Comptage et ajoute les mouvements suivants. La fiche d’une caisse raconte son histoire par date : Comptages, Recettes d’espèces, dépenses, transferts et Écarts de caisse.',
			'Une caisse de réserve se compte quand vous voulez, sans Session ni Action. Si le Comptage diffère du solde attendu, l’outil demande de recompter une fois. Le même total enregistre un Écart de caisse.'
		]
	},
	{
		id: 'comptage',
		titre: 'Compter une caisse',
		paragraphes: [
			'Touchez + et − pour chaque coupure, ou touchez la quantité pour la taper. Le total se calcule au fur et à mesure, et reste visible en bas de l’écran.',
			'Le Comptage en cours reste sur votre téléphone si la page se recharge. Rien n’est enregistré sans réseau : notez le total sur papier, et saisissez-le ensuite avec « Compté à un autre moment ? ».',
			'À l’ouverture, si le Comptage diffère de la dernière clôture, recomptez une fois. Enregistrer le même total confirme la différence, qui devient un Écart de caisse. Ça arrive, et ce n’est pas grave.',
			'Une erreur ? Votre dernier Comptage se corrige tant que la Session n’est pas clôturée.'
		]
	},
	{
		id: 'sessions',
		titre: 'Sessions de caisse',
		paragraphes: [
			'Une Session suit une caisse pendant un évènement, de son Comptage d’ouverture à son Comptage final. Plusieurs caisses peuvent être ouvertes sur une même Action.',
			'Tant qu’une Session est ouverte, toute Opération sur cette caisse s’y rattache, quel que soit l’écran de saisie. Après le Comptage final, le formulaire demande si la somme était encore dans la caisse : un transfert fait après le Comptage n’entre pas dans la recette.',
			'La Recette d’espèces se calcule en addition posée : Comptage final, moins Fond de caisse, plus dépenses en espèces et transferts sortants, moins transferts entrants. Clôturer la Session l’enregistre dans l’Action, sans ressaisie.',
			'Une erreur après la clôture ? Rouvrez la dernière Session de la caisse : sa recette s’annule, et la prochaine clôture la recalcule. Tant qu’une Session est ouverte, l’Exercice ne se clôture pas.'
		]
	},
	{
		id: 'cheques-recus',
		titre: 'Chèques reçus',
		paragraphes: [
			'Un Chèque reçu compte en recette dès sa réception, sur le Compte Chèques à remettre. Il attend là sa Remise : le solde de ce Compte égale toujours le total des chèques en attente, sans rien à constater.',
			'Pour une pile, restez dans la rangée de saisie : Entrée enregistre le chèque et repart, en gardant la date et l’Action. Pour un chèque qui couvre plusieurs Actions, ouvrez « Plusieurs Actions » : la répartition se contrôle au centime.',
			'Un chèque en attente se corrige ou s’annule. Une fois remis, il ne bouge plus. Son état se lit tout seul : En attente, Remis, Pointé ou Rejeté.'
		]
	},
	{
		id: 'remises',
		titre: 'Remises et bordereau',
		paragraphes: [
			'Nouvelle Remise coche tous les chèques en attente. Décochez ce qui ne part pas au guichet, contrôlez le total avec le paquet en main, choisissez le Compte, puis créez la Remise et téléchargez le bordereau.',
			'Le relevé venu, la Remise est proposée avec ses chèques. Si la banque l’a scindée autrement que le bordereau, cochez les lignes et les Remises, puis pointez : le total est contrôlé, et chaque Remise garde la répartition de la banque.',
			'Une Remise non pointée s’annule : ses chèques redeviennent en attente. Son numéro ne resservira pas.'
		]
	},
	{
		id: 'cheque-rejete',
		titre: 'Un chèque rejeté',
		paragraphes: [
			'« Marquer comme rejeté » annule la recette par une nouvelle Opération, sur le Compte où se trouve le chèque. Rien ne s’efface : le chèque reste au registre, état Rejeté, et le résultat retombe juste.',
			'La ligne de rejet du relevé se pointe avec cette Opération. Si le chèque date d’un Exercice clôturé, le rejet s’enregistre dans l’Exercice ouvert.'
		]
	},
	{
		id: 'cheques-emis',
		titre: 'Chèques émis',
		paragraphes: [
			'Le registre se remplit à la saisie : une Dépense en mode Chèque demande le numéro et le bénéficiaire. Pointé veut dire que le chèque est passé en banque. Un n° déjà utilisé est refusé.',
			'Une formule abîmée ou perdue s’annule sans paiement : elle reste au registre, état Annulé.',
			'Un chèque vu au relevé et absent du registre porte la pastille À regarder, et remonte au Tableau de contrôle. Créez son Opération depuis la ligne : le signalement disparaît.'
		]
	},
	{
		id: 'sumup',
		titre: 'Versements SumUp',
		paragraphes: [
			'SumUp verse le net, après ses frais. Depuis la ligne du relevé, « Répartir brut et frais » montre la vraie recette et le vrai coût : le brut est une recette, les frais une dépense, et le net se contrôle au centime.',
			'Sans détail dans l’export SumUp, indiquez seulement les frais : le brut se calcule. L’Opération se pointe à l’enregistrement, et n’attend aucune Pièce.'
		]
	},
	{
		id: 'factures',
		titre: 'Factures émises',
		paragraphes: [
			'Une facture se prépare en brouillon : le formulaire à gauche, le PDF à droite. Un brouillon ne porte aucun numéro, ne compte nulle part et se supprime librement.',
			'Valider donne le numéro suivant, chronologique et sans trou, puis fige la facture et son PDF. La Créance apparaît dans Créances et Dettes. La recette, elle, ne compte qu’à l’encaissement.',
			'Quand le relevé montre le paiement, le Pointage signale la Créance. « Créer et solder » écrit l’Opération et la solde d’un seul geste.',
			'Une facture validée ne se modifie plus. Pour l’annuler, créez un Avoir : il prend le numéro suivant, éteint ce qui reste dû, et ouvre une Dette si l’APE a déjà encaissé quelque chose.',
			'Les mentions imprimées en bas se règlent dans Réglages, Association. Vérifiez-les selon la situation de votre APE.'
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

export const ARTICLES_ETATS: readonly Article[] = [
	{
		id: 'tableau-de-controle',
		titre: 'Tableau de contrôle',
		paragraphes: [
			'La phrase du haut dit où vous en êtes. Elle n’est jamais rassurante si un Compte ne tombe pas juste : « 1 Compte ne tombe pas juste » veut dire qu’un Écart reste sans explication.',
			'Chaque carte pose l’addition : solde de départ, plus les mouvements, égale le solde calculé, comparé au solde constaté sur le relevé. Un Écart expliqué par des lignes non pointées n’est pas une erreur : il reste à pointer.',
			'Un contrôle de plus de 45 jours passe en À regarder : il manque sans doute un relevé.',
			'Avant l’arrivée des Sessions de caisse, une caisse se compte à la main : le montant saisi sur sa carte devient son solde constaté.'
		]
	},
	{
		id: 'resultat-actions',
		titre: 'Résultat par Action',
		paragraphes: [
			'L’écran Actions range vos activités par Groupe. Dépliez un Groupe, une Action, une Nature, puis ouvrez une Ligne : vous arrivez à l’Opération, à sa Pièce et à son mouvement bancaire.',
			'Les Lignes sans Action sont réunies à part, par Nature. Le pied de page se raccorde au résultat de l’Exercice : c’est la preuve que rien n’a été oublié.',
			'Les sommes neutres n’apparaissent pas ici, et les Lignes rattachées à un Exercice antérieur forment un bloc séparé, sous le pied.'
		]
	},
	{
		id: 'compte-de-resultat',
		titre: 'Compte de résultat',
		paragraphes: [
			'Il dit ce que l’Exercice a rapporté et coûté, Groupe par Groupe, dans l’ordre choisi dans les Réglages. Une dépense remboursée vient en moins des Dépenses, pas en Recettes.',
			'Une Ligne compte toujours dans l’Exercice de sa date. Rattachée à un Exercice antérieur, elle rejoint le bloc « Sur Exercices antérieurs » et sort du résultat de l’année.',
			'Comparer à ajoute une colonne de résultat par Exercice choisi, sur ordinateur. Une Action absente d’une année y reste vide : elle n’a rien coûté ni rapporté, elle n’existait pas. Un Exercice clôturé se compare avec le paramétrage de sa clôture. Les exports portent les mêmes colonnes.'
		]
	},
	{
		id: 'etat-de-tresorerie',
		titre: 'État de trésorerie',
		paragraphes: [
			'Il donne, pour chaque Compte, le solde de départ, le solde de fin et leur variation, avec les totaux des Créances et Dettes à la fin de l’Exercice.',
			'La trésorerie ne bouge pas toujours du résultat : l’Explication résultat et variation le détaille, avec les Lignes sur Exercices antérieurs, les sommes neutres et les Mouvements internes à cheval sur deux Exercices. Si une différence restait sans explication, l’état le signalerait.'
		]
	},
	{
		id: 'document-ag',
		titre: 'Document d’AG',
		paragraphes: [
			'Il réunit le Compte de résultat et l’État de trésorerie en un PDF à présenter en assemblée générale, avec les Écarts qui restent. D’une année à l’autre, les Groupes gardent leur ordre.',
			'Tant que l’Exercice est ouvert, il porte le filigrane « Provisoire ». Une fois l’Exercice clôturé, il ne change plus.'
		]
	},
	{
		id: 'budget',
		titre: 'Budget',
		paragraphes: [
			'Le Budget dit ce que vous prévoyez, Action par Action et Nature par Nature. Une Nature qui rapporte et qui coûte a une rangée Recette et une rangée Dépense. Il se prépare sur ordinateur, et se consulte sur téléphone.',
			'Repartir du réalisé remplit le Prévu avec les chiffres de l’Exercice précédent, à ajuster ensuite. Une Action ou une Nature retirée n’est pas reprise. Partir de zéro laisse tout vide.',
			'Chaque montant s’enregistre seul à la sortie du champ, et Entrée passe au suivant. C’est le seul écran qui fonctionne ainsi, car un Budget n’est pas une donnée comptable : il ne passe pas au Journal. Videz un champ pour retirer sa prévision.',
			'Une dépense au-delà du prévu porte la pastille À regarder. Ce n’est pas une erreur, juste un chiffre à relire. Une recette n’en porte pas : l’année n’est pas finie.'
		]
	},
	{
		id: 'exports',
		titre: 'Exports',
		paragraphes: [
			'Le menu Exporter d’un état donne un PDF, ou un fichier XLSX pour un tableur, avec l’Exercice regardé et les chiffres de l’écran.',
			'L’export complet, dans Réglages, Sauvegardes, emporte toutes vos données dans une archive lisible sans l’outil : les Opérations, les Lignes et les Pointages en CSV, avec les Pièces.'
		]
	},
	{
		id: 'cloture',
		titre: 'Clôturer un Exercice',
		paragraphes: [
			'La page de clôture liste les Écarts, les Lignes de relevé non pointées et les Pièces manquantes. Rien de tout cela n’empêche de clôturer. Seuls deux cas bloquent : l’Exercice le plus ancien se clôture en premier, et une Session de caisse ouverte doit être clôturée avant.',
			'Une fois clôturé, un Exercice ne se modifie plus, ne se rouvre pas, et ses états restent identiques, même si vous renommez un Groupe. Une correction passe par une nouvelle Opération dans un Exercice ouvert.',
			'Restent permis : ajouter une Pièce, dire qu’une Pièce n’est pas nécessaire, relier deux paiements, et pointer une Ligne de relevé arrivée après coup. Un relevé importé après la clôture entre normalement : son solde est seulement ignoré s’il est daté dans l’Exercice clôturé.'
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
		terme: 'Bordereau',
		ancre: 'bordereau',
		definition: 'Liste des Chèques reçus d’une Remise, à déposer au guichet avec le paquet.'
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
		definition:
			'États calculés. Le Document d’AG réunit les deux premiers pour l’assemblée générale.'
	}
];

/** Raccourcis livrés. Les autres arrivent avec leur fonction. */
export const RACCOURCIS: readonly { touche: string; effet: string }[] = [
	{ touche: 'Ctrl+K', effet: 'Recherche globale (⌘K sur Mac)' },
	{ touche: 'n', effet: 'Nouvelle Opération' },
	{ touche: '?', effet: 'Aide des raccourcis de l’écran' },
	{ touche: 'Échap', effet: 'Ferme la couche du dessus' },
	{ touche: 'Ctrl+Entrée', effet: 'Dans le panneau : enregistre (⌘Entrée sur Mac)' },
	{ touche: '=', effet: 'Dans un montant de Ligne : insère le reste à répartir' }
];

/** Raccourcis propres à la page Pointage : la file ou le volet doit avoir le focus. */
export const RACCOURCIS_POINTAGE: readonly { touche: string; effet: string }[] = [
	{ touche: '↓ ↑ ou j k', effet: 'Ligne de relevé suivante, précédente' },
	{ touche: '1 2 3', effet: 'Sélectionne une proposition' },
	{ touche: 'Entrée', effet: 'Pointe avec la proposition sélectionnée' },
	{ touche: 'Espace', effet: 'Coche pour relier plusieurs éléments' },
	{ touche: 'c', effet: 'Crée une Opération depuis la ligne' },
	{ touche: 'r', effet: 'Cherche une Opération à relier' },
	{ touche: 'p', effet: 'Passe cette ligne, sans la pointer' },
	{ touche: 'Ctrl+Z', effet: 'Annule le dernier Pointage (⌘Z sur Mac)' }
];

/** Pour un·e successeur·e : l'année racontée dans l'ordre (UJ-4). */
export const PREMIERE_ANNEE: readonly { titre: string; texte: string }[] = [
	{
		titre: 'En septembre',
		texte:
			'Regardez le Tableau de contrôle : il dit où en sont les Comptes. Le Journal raconte ce qui s’est passé avant vous.'
	},
	{
		titre: 'Chaque mois',
		texte:
			'Saisissez les dépenses et les recettes au fil de l’eau, avec le relevé sous les yeux. Une Opération simple prend quelques secondes.'
	},
	{
		titre: 'À chaque évènement',
		texte:
			'Créez une Action pour la Kermesse ou la sortie : son résultat se lira tout seul. Répartissez les factures communes entre Actions.'
	},
	{
		titre: 'En fin d’année',
		texte:
			'Un paiement tardif se rattache à l’Exercice précédent. Deux Exercices peuvent rester ouverts le temps de finir l’année.'
	}
];
