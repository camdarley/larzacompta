/**
 * Catalogue unique des messages (AD-19), repris mot pour mot d'EXPERIENCE.md.
 * Un paramètre s'écrit `{nom}` et se remplit depuis `erreur.details`.
 */
import type { ErreurMetier } from '#lib/domaine/resultat.ts';

const MESSAGES = {
	// Messages d'erreur et d'alerte.
	fichier_illisible:
		'Ce fichier n’a pas pu être lu : il ne ressemble pas à un relevé OFX ou CSV. Rien n’a été importé. Vérifiez que vous avez choisi le bon fichier.',
	releve_plusieurs_comptes:
		'Ce fichier contient les relevés de plusieurs comptes. Rien n’a été importé. Téléchargez un fichier par compte.',
	releve_autre_compte:
		'Ce fichier vient d’un autre compte bancaire que les relevés déjà importés ici. Rien n’a été importé. Vérifiez le Compte choisi.',
	identifiant_repete:
		'{lignes} un identifiant déjà vu, avec un autre contenu : c’est peut-être un mouvement de plus. Gardez ou écartez chaque ligne.',
	ligne_identifiant_repete:
		'Cette ligne reprend un identifiant déjà vu, avec un autre contenu. Gardez-la si c’est un mouvement réel.',
	format_change:
		'La colonne {colonne} est introuvable dans ce fichier. Rien n’a été importé. Indiquez les colonnes pour continuer.',
	fichier_connu: 'Toutes les lignes de ce fichier sont déjà connues. Rien n’a été ajouté.',
	doublon_possible:
		'Ces deux lignes sont identiques : même date, même montant, même libellé. Si ce sont deux mouvements réels, gardez-les toutes les deux.',
	trou_de_dates: 'Aucune ligne entre le {debut} et le {fin}. Il manque peut-être un relevé.',
	ventilation_incomplete:
		'Il reste {montant} à répartir. Ajoutez une Ligne ou corrigez un montant.',
	cote_pointe:
		'Cette Opération est pointée : son montant et son Compte sont verrouillés. Annulez d’abord le Pointage pour les modifier.',
	exercice_cloture:
		'{exercice} est clôturé : rien ne change plus dans cet Exercice. Pour corriger, créez une nouvelle Opération dans un Exercice ouvert.',
	pointage_desequilibre:
		'Il reste {montant} d’écart entre le relevé et l’Opération. Corrigez l’Opération, ou créez un ajustement de {montant}.',
	comptage_ouverture_different:
		'Vous avez compté {montant} {sens} que la dernière clôture. Ça arrive. Recomptez une fois pour vérifier.',
	comptage_reserve_different:
		'Vous avez compté {montant} {sens} que le solde attendu. Ça arrive. Recomptez une fois pour vérifier.',
	difference_confirmee:
		'La différence de {montant} est confirmée. Elle sera notée comme Écart de caisse.',
	application_en_marche:
		'L’application tourne encore : arrêtez-la avec « docker compose stop app », puis relancez cette commande.',
	instance_en_place:
		'Cette installation contient déjà une base ou des fichiers. Pour les remplacer, ajoutez --remplacer : ils seront gardés dans avant-restauration/.',
	sauvegarde_sans_base: 'Cette sauvegarde ne contient pas de base : rien n’a été remplacé.',
	acces_refuse:
		'Votre Accès ne permet pas de voir cette page. Demandez à la personne qui tient la trésorerie si vous en avez besoin.',
	identifiant_reserve: 'Cet identifiant est réservé. Choisissez-en un autre.',
	connexion_refusee: 'Identifiant ou mot de passe incorrect.',
	trop_de_tentatives: 'Trop d’essais. Réessayez dans 15 minutes.',
	adresse_illisible: 'Cette adresse n’est pas lisible.',
	exercice_cloture_saisies:
		'{exercice} est clôturé. Cet écran suit l’argent d’aujourd’hui : vos saisies iront dans {ouvert}.',
	releve_trop_long:
		'Ce fichier compte {lignes} lignes, c’est plus que les {max} lues en une fois. Vérifiez que c’est bien un relevé, ou coupez-le en plusieurs fichiers.',
	reglement_repris_par_avoir:
		'Cet encaissement a été repris par un Avoir, qui en doit le montant. Annulez d’abord la Dette née de cet Avoir.',
	mot_de_passe_perdu:
		'Il n’y a pas de récupération par e-mail. Demandez à la personne qui gère l’installation de réinitialiser votre Accès.',
	session_expiree:
		'Votre session a expiré par sécurité. Reconnectez-vous : votre saisie est conservée.',
	modification_concurrente:
		'Cette Opération vient d’être modifiée par une autre personne. Rechargez pour voir la dernière version. Vos changements restent affichés ici pour les recopier.',
	reseau_coupe:
		'Pas de réseau pour l’instant. Votre saisie reste sur cet écran. Réessayez quand la connexion revient.',
	erreur_serveur:
		'Quelque chose n’a pas fonctionné de notre côté. Rien n’a été perdu. Réessayez dans un instant.',
	piece_refusee:
		'Cette photo pèse plus de 20 Mo ou n’est ni un PDF, ni une image. Essayez avec une photo plus légère.',
	sauvegarde_echec:
		'La sauvegarde de cette nuit a échoué. Vos données sont intactes, mais prévenez la personne qui gère l’installation.',
	copie_hors_vps_absente:
		'Vos sauvegardes restent sur ce serveur : copie hors du VPS à configurer. Prévenez la personne qui gère l’installation.',
	version_obsolete:
		'Une version plus récente est disponible, avec des correctifs de sécurité. Prévenez la personne qui gère l’installation.',

	ligne_demesuree:
		'« {libelle} », du {date}, porte un montant démesuré : ce n’est pas un mouvement réel. Cette ligne est écartée des calculs. Retirez-la, puis importez le bon fichier.',
	solde_demesure:
		'Le solde de relevé du {date} est démesuré : il est écarté du contrôle. Retirez-le, puis indiquez le bon solde.',
	releve_demesure:
		'Un relevé porte un montant démesuré : il est écarté des calculs. Retirez-le depuis le Pointage.',

	// Refus métier.
	ligne_hors_exercice:
		'Cette ligne tombe après le dernier Exercice ouvert. Ouvrez l’Exercice suivant dans Réglages, puis créez l’Opération.',
	date_hors_exercice:
		'Cette date ne tombe dans aucun Exercice ouvert. Choisissez une date dans un Exercice ouvert, ou ouvrez l’Exercice suivant dans Réglages.',
	rattachement_invalide:
		'Une Ligne se rattache à son Exercice ou à un Exercice antérieur. Choisissez-en un autre.',
	reference_inactive: 'Cette Nature ou cette Action est désactivée. Choisissez-en une autre.',
	operation_geree_ailleurs:
		'Cette Opération vient d’une autre page. Ici, seuls le libellé, la note et les Pièces se modifient.',
	doublon_a_confirmer: 'Confirmez ou écartez d’abord cette Ligne de relevé, identique à une autre.',
	exercice_invalide: 'Deux Exercices peuvent être ouverts, pas trois, et ils se suivent sans trou.',
	cloture_ordre: 'Clôturez d’abord l’Exercice le plus ancien.',
	session_a_cloturer:
		'La Session de la {caisse} n’est pas clôturée : sa Recette d’espèces manquerait à cet Exercice. Clôturez-la d’abord.',
	comptage_manquant: 'Il manque le Comptage final. Comptez la caisse avant de clôturer la Session.',
	session_invalide:
		'Cette Session ne peut pas changer d’état : seule la dernière Session d’une caisse se rouvre, dans un Exercice ouvert.',
	recomptage_requis:
		'Vous avez compté {montant} {sens} que le solde attendu. Ça arrive. Recomptez une fois pour vérifier.',
	comptage_date_future: 'Ce Comptage se date du jour où il a eu lieu, pas d’un jour à venir.',
	comptage_date_anterieure:
		'Cette date précède le Comptage d’avant sur cette caisse. Choisissez le jour où vous avez compté.',
	comptage_vide: 'Rien n’est compté. Indiquez au moins une quantité, ou vérifiez la caisse.',
	session_cloturee:
		'Cette Opération fait partie d’une Session clôturée : la Recette d’espèces en dépend. Rouvrez la Session pour la corriger.',
	cheque_remis:
		'Ce chèque est déjà remis : il ne se modifie plus. Annulez d’abord sa Remise, si elle n’est pas pointée.',
	cheque_rejete: 'Ce chèque est rejeté : il reste au registre, tel quel.',
	remise_vide: 'Cochez au moins un chèque pour créer la Remise.',
	remise_desequilibree:
		'Ces chèques ne donnent plus le total affiché : l’un d’eux vient de changer. Rechargez la page, puis recomptez le paquet.',
	remise_compte_invalide: 'Une Remise se dépose sur un Compte banque ou épargne. Choisissez-en un.',
	remise_date_anterieure:
		'Cette date précède la réception d’un des chèques. Choisissez le jour du dépôt.',
	remise_avec_rejet:
		'Un chèque de cette Remise est rejeté : elle ne s’annule plus. Annulez d’abord le rejet, si vous vous êtes trompé.',
	rejet_date_anterieure:
		'Cette date précède l’arrivée du chèque sur son Compte. Choisissez le jour du rejet.',
	cheque_absent:
		'Le chèque n° {numero} est passé en banque, mais il n’est pas au registre. Créez son Opération pour l’y inscrire.',
	cheque_annule_en_banque:
		'Le chèque n° {numero} est passé en banque, alors qu’il est annulé au registre. Vérifiez auprès de la banque, puis reliez ou créez l’Opération.',
	versement_sumup:
		'Versement SumUp : répartissez le brut et les frais pour voir la vraie recette et le vrai coût.',
	numero_cheque_utilise:
		'Ce n° de chèque est déjà au registre. Vérifiez le numéro sur la formule ou le talon.',
	numero_cheque_requis: 'Indiquez le n° du chèque : il entre au registre des Chèques émis.',
	reglement_excessif: 'Ce règlement dépasse le reste dû. Corrigez le montant.',
	reglement_sens:
		'Une somme à recevoir se solde par une Recette, une somme à payer par une Dépense.',
	reglement_depasse_operation:
		'Les sommes soldées dépassent le montant de l’Opération. Corrigez un montant.',
	creance_annulee: 'Cette somme a été annulée : elle ne se solde plus.',
	dernier_tresorier: 'Il faut garder au moins un Accès trésorier·e actif.',
	facture_date_anterieure:
		'Cette date précède celle de la dernière Facture émise. La numérotation doit rester chronologique.',
	facture_date_future:
		'Une Facture se date au plus tard d’aujourd’hui : une date à venir bloquerait les numéros suivants.',
	facture_incomplete: 'Indiquez le tiers et la date avant de valider.',
	facture_sans_montant: 'Ajoutez au moins une ligne avec un montant avant de valider.',
	facture_validee:
		'Cette Facture est validée : elle ne se modifie plus. Pour l’annuler, créez un Avoir.',
	facture_deja_annulee: 'Cette Facture est déjà annulée par un Avoir.',
	creance_de_facture:
		'Cette Créance vient d’une Facture : elle s’annule par un Avoir, depuis la Facture.',
	piece_utilisee: 'Cette Pièce justifie une Opération : elle ne peut pas être supprimée.',
	pointage_fige:
		'Ce Pointage ne relie que des éléments d’un Exercice clôturé : il ne s’annule plus.',
	ligne_releve_pointee: 'Cette Ligne de relevé est pointée. Annulez d’abord le Pointage.',
	rendu_excessif: 'Il reste {montant} à rendre sur cette somme : on ne peut pas rendre davantage.',
	compte_non_vide:
		'Ce Compte porte encore {montant} ou des lignes de relevé à pointer. Soldez-le d’abord, ainsi le contrôle reste juste.',
	ancre_invalide: 'Le solde de départ d’un Compte se pose au début d’un Exercice ouvert.',
	ancre_apres_mouvement:
		'Ce Compte a déjà des mouvements avant cet Exercice : son solde de départ ne peut plus s’y poser.',
	pointage_incoherent:
		'Ces éléments ne se pointent pas ensemble : ils doivent porter sur le même Compte, et n’être pas déjà pointés.',
	ligne_releve_conservee:
		'Cette Ligne de relevé vient de votre banque : seule une ligne en double s’écarte.',
	solde_egal_releve: 'Le solde calculé égale le relevé du {date}, au centime.',
	lignes_traitees_ecart: 'Toutes les lignes sont traitées, mais il reste un Écart de {montant}.',
	date_decalee:
		'« {libelle} » est daté du {dateCote}, après le relevé du {dateReleve} : le calcul de ce jour ne le compte pas encore.',
	virement_croise:
		'La même somme figure sur le relevé de {compte}, le {date}. Un seul Mouvement interne, les deux lignes pointées, chacune à sa date.',
	ligne_avant_ancre:
		'Cette date précède le solde de départ de ce Compte : la ligne n’entrerait pas dans le contrôle.',

	// Saisie et parcours d'Accès, absents du tableau d'EXPERIENCE.md, même ton.
	forme_invalide:
		'Cette Opération n’est pas complète. Vérifiez ses montants et ses Comptes, puis réessayez.',
	ventilation_excedent: 'Il y a {montant} de trop. Retirez-les d’une Ligne ou corrigez le montant.',
	compte_inactif: 'Ce Compte est désactivé. Choisissez-en un autre.',
	operation_annulee: 'Cette Opération est annulée : elle ne se modifie plus.',
	liaison_invalide:
		'Ces Opérations ne peuvent pas être reliées : elles le sont déjà, ou l’une d’elles est annulée.',
	saisie_invalide: 'Vérifiez les champs signalés.',
	solde_depart_requis: 'Indiquez ce solde, même s’il vaut 0.',
	champ_requis: 'Ce champ est à remplir.',
	montant_invalide: 'Ce montant n’est pas lisible. Écrivez par exemple 1 000,50 ou 220+180.',
	quantite_invalide: 'Écrivez une quantité entière, par exemple 12.',
	date_invalide: 'Cette date n’est pas lisible. Écrivez-la sous la forme 12/03/2026.',
	mot_de_passe_court: 'Choisissez un mot de passe de 12 caractères ou plus.',
	mot_de_passe_faux: 'Ce mot de passe n’est pas le bon.',
	lien_invalide:
		'Ce lien n’est plus valable : il a déjà servi ou il a expiré. Demandez-en un nouveau à la personne qui tient la trésorerie.',
	libelle_deja_utilise: 'Ce nom existe déjà. Choisissez-en un autre.',
	identifiant_deja_utilise: 'Cet identifiant existe déjà. Choisissez-en un autre.',
	deja_utilise: 'Cette valeur existe déjà. Choisissez-en une autre.',
	element_utilise: 'Cet élément est déjà utilisé : il se désactive, mais ne se supprime pas.',
	groupe_utilise: 'Ce Groupe porte encore des Natures ou des Actions. Déplacez-les d’abord.',
	element_systeme: 'Cette Nature sert au calcul de l’outil : elle reste telle quelle.',
	element_introuvable: 'Cet élément n’existe plus. Rechargez la page.',
	budget_cloture: 'Cet Exercice est clôturé : son Budget ne change plus.',
	budget_deja_prepare: 'Cet Exercice a déjà un Budget. Ajustez-le directement.',
	budget_sans_realise: 'Il n’y a aucun réalisé à reprendre : partez de zéro.',
	association_absente: 'Décrivez d’abord votre APE.'
} as const;

export type CodeMessage = keyof typeof MESSAGES;

/** Textes d'interface fixes, cités par plusieurs écrans. */
export const TEXTES = {
	enregistre: 'Enregistré.',
	exercice_cloture_bandeau: 'Exercice clôturé, lecture seule',
	aucun_exercice_ouvert:
		'Aucun Exercice n’est ouvert : une Opération ne pourrait pas s’enregistrer.',
	exercice_cloture_pieces:
		'Exercice clôturé : ses chiffres ne changent plus. Une Pièce retrouvée peut encore se joindre.',
	sur_ordinateur: 'Cet écran se travaille sur ordinateur.',
	quitter_sans_enregistrer: 'Quitter sans enregistrer ?',
	cahier_pret: 'Votre cahier est prêt.',
	comptage_repris: 'Repris du dernier Comptage. Vérifiez la caisse et corrigez si besoin.',
	comptage_a_faire: 'La caisse a bougé depuis le dernier Comptage. Comptez-la.',
	comptage_reseau:
		'Pas de réseau pour l’instant. Rien n’est enregistré : le Comptage reste sur ce téléphone. Notez le total sur papier, puis réessayez.',
	tout_pointe: 'Tout est pointé',
	aucun_ecart: 'Égal au relevé',
	premier_releve: 'Importez votre premier relevé pour commencer le contrôle.',
	solde_ignore:
		'Le solde de ce relevé tombe dans un Exercice clôturé ou avant le solde de départ : il est ignoré.',
	sauvegarde_echec:
		'La sauvegarde de cette nuit a échoué. Vos données sont intactes, mais prévenez la personne qui gère l’installation.',
	copie_hors_vps:
		'Vos sauvegardes restent sur ce serveur : copie hors du VPS à configurer. Prévenez la personne qui gère l’installation.',
	version_obsolete:
		'Une version plus récente est disponible, avec des correctifs de sécurité. Prévenez la personne qui gère l’installation.'
} as const;

function remplir(gabarit: string, details: Record<string, unknown> | undefined) {
	return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) => String(details?.[nom] ?? ''));
}

export function message(code: CodeMessage, details?: Record<string, unknown>): string {
	return remplir(MESSAGES[code], details);
}

function estConnu(code: string): code is CodeMessage {
	return Object.hasOwn(MESSAGES, code);
}

/** Texte d'une erreur métier. Jamais de code technique à l'écran. */
export function messageErreur(erreur: ErreurMetier): string {
	if (erreur.code === 'exercice_cloture' && !erreur.details?.exercice) {
		return message('exercice_cloture', { exercice: 'Cet Exercice' });
	}
	return estConnu(erreur.code) ? message(erreur.code, erreur.details) : message('erreur_serveur');
}

/** Tout code d'erreur doit avoir son message : contrôlé en test. */
export const CODES_MESSAGES = Object.keys(MESSAGES) as CodeMessage[];
