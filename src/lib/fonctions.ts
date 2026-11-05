/**
 * Fonctions livrées (AD-22). Ce fichier pilote navigation, tuiles et choix proposés :
 * une fonction absente d'ici n'apparaît nulle part, sans entrée grisée ni écran « bientôt ».
 */
import { peut, type Droit, type Role } from './domaine/droits.ts';

export type Fonction =
	| 'tableau_controle'
	| 'operations'
	| 'pointage'
	| 'caisses'
	| 'cheques'
	| 'creances_dettes'
	| 'pieces'
	| 'factures'
	| 'actions'
	| 'etats'
	| 'budget'
	| 'reglages'
	| 'journal'
	| 'aide';

const LIVREES: ReadonlySet<Fonction> = new Set<Fonction>([
	'tableau_controle',
	'operations',
	'pointage',
	'creances_dettes',
	'pieces',
	'reglages',
	'journal',
	'aide'
]);

/** Rôles proposés à la création d'un Accès. Compteur·se au jalon 2, Lecteur·rice au jalon 3. */
const ROLES_LIVRES: readonly Role[] = ['tresorier'];

export function fonctionLivree(fonction: Fonction, livrees = LIVREES): boolean {
	return livrees.has(fonction);
}

export function rolesLivres(): readonly Role[] {
	return ROLES_LIVRES;
}

export type NomIcone =
	| 'accueil'
	| 'operations'
	| 'pointage'
	| 'caisses'
	| 'cheques'
	| 'creances'
	| 'pieces'
	| 'photo'
	| 'factures'
	| 'actions'
	| 'etats'
	| 'budget'
	| 'reglages'
	| 'journal'
	| 'aide';

export type Entree = {
	fonction: Fonction;
	libelle: string;
	/** Libellé court de `barre-mobile`. */
	libelleCourt?: string;
	href: string;
	droit: Droit;
	icone: NomIcone;
};

export type GroupeNavigation = { titre: string; entrees: Entree[] };

const AU_QUOTIDIEN: Entree[] = [
	{
		fonction: 'tableau_controle',
		libelle: 'Tableau de contrôle',
		libelleCourt: 'Contrôle',
		href: '/',
		droit: 'consulter',
		icone: 'accueil'
	},
	{
		fonction: 'operations',
		libelle: 'Opérations',
		href: '/operations',
		droit: 'consulter',
		icone: 'operations'
	},
	{
		fonction: 'pointage',
		libelle: 'Pointage',
		href: '/pointage',
		droit: 'saisir',
		icone: 'pointage'
	},
	{
		fonction: 'caisses',
		libelle: 'Caisses',
		href: '/caisses',
		droit: 'consulter_suivi',
		icone: 'caisses'
	},
	{
		fonction: 'cheques',
		libelle: 'Chèques',
		href: '/cheques',
		droit: 'consulter_suivi',
		icone: 'cheques'
	}
];

const SUIVI: Entree[] = [
	{
		fonction: 'creances_dettes',
		libelle: 'Créances et Dettes',
		href: '/creances-dettes',
		droit: 'consulter_suivi',
		icone: 'creances'
	},
	{ fonction: 'pieces', libelle: 'Pièces', href: '/pieces', droit: 'consulter', icone: 'pieces' },
	{
		fonction: 'factures',
		libelle: 'Factures',
		href: '/factures',
		droit: 'saisir',
		icone: 'factures'
	}
];

const RESULTATS: Entree[] = [
	{
		fonction: 'actions',
		libelle: 'Actions',
		href: '/actions',
		droit: 'consulter',
		icone: 'actions'
	},
	{ fonction: 'etats', libelle: 'États', href: '/etats', droit: 'consulter', icone: 'etats' },
	{ fonction: 'budget', libelle: 'Budget', href: '/budget', droit: 'saisir', icone: 'budget' }
];

const BAS_DE_BARRE: Entree[] = [
	{
		fonction: 'reglages',
		libelle: 'Réglages',
		href: '/reglages',
		droit: 'parametrer',
		icone: 'reglages'
	},
	{
		fonction: 'journal',
		libelle: 'Journal',
		href: '/journal',
		droit: 'consulter',
		icone: 'journal'
	},
	{ fonction: 'aide', libelle: 'Aide', href: '/aide', droit: 'etre_connecte', icone: 'aide' }
];

function visibles(entrees: Entree[], role: Role, livrees: ReadonlySet<Fonction>) {
	return entrees.filter((e) => livrees.has(e.fonction) && peut(role, e.droit));
}

export type Navigation = { groupes: GroupeNavigation[]; bas: Entree[] };

/** Entrées de `barre-mobile`, dans l'ordre d'EXPERIENCE.md. « Plus » mène au reste. */
const MOBILE_TRESORIER: Entree[] = [
	AU_QUOTIDIEN[0] as Entree,
	AU_QUOTIDIEN[1] as Entree,
	AU_QUOTIDIEN[3] as Entree,
	{
		fonction: 'pieces',
		libelle: 'Photo',
		href: '/pieces/photo',
		droit: 'saisir',
		icone: 'photo'
	}
];

const MOBILE_LECTEUR: Entree[] = [
	AU_QUOTIDIEN[0] as Entree,
	RESULTATS[0] as Entree,
	RESULTATS[1] as Entree,
	SUIVI[1] as Entree
];

export function entreesMobile(role: Role, livrees = LIVREES): Entree[] {
	return visibles(role === 'tresorier' ? MOBILE_TRESORIER : MOBILE_LECTEUR, role, livrees);
}

export function navigation(role: Role, livrees = LIVREES): Navigation {
	const groupes = [
		{ titre: 'Au quotidien', entrees: visibles(AU_QUOTIDIEN, role, livrees) },
		{ titre: 'Suivi', entrees: visibles(SUIVI, role, livrees) },
		{ titre: 'Résultats', entrees: visibles(RESULTATS, role, livrees) }
	].filter((g) => g.entrees.length > 0);
	return { groupes, bas: visibles(BAS_DE_BARRE, role, livrees) };
}
