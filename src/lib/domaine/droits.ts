/** Matrice des droits (AD-15). Toute lecture et toute écriture déclarent le leur. */
export const ROLES = ['tresorier', 'lecteur', 'compteur'] as const;
export type Role = (typeof ROLES)[number];

export type Droit =
	/** Saisir, corriger, pointer, clôturer. */
	| 'saisir'
	/** Consulter recherche, états, Pièces, Journal. */
	| 'consulter'
	/** Consulter Caisses, Chèques, Créances et Dettes, en lecture seule. */
	| 'consulter_suivi'
	/** Ouvrir une Session de caisse et saisir un Comptage. */
	| 'compter'
	/** Clôturer une Session de caisse. */
	| 'cloturer_session'
	/** Gérer les Accès et le paramétrage. */
	| 'parametrer'
	/** Ce qui suit toute personne connectée : Aide, Préférences, déconnexion. */
	| 'etre_connecte';

export const MATRICE: Readonly<Record<Droit, Readonly<Record<Role, boolean>>>> = {
	saisir: { tresorier: true, lecteur: false, compteur: false },
	consulter: { tresorier: true, lecteur: true, compteur: false },
	consulter_suivi: { tresorier: true, lecteur: true, compteur: false },
	compter: { tresorier: true, lecteur: false, compteur: true },
	cloturer_session: { tresorier: true, lecteur: false, compteur: false },
	parametrer: { tresorier: true, lecteur: false, compteur: false },
	etre_connecte: { tresorier: true, lecteur: true, compteur: true }
};

export function peut(role: Role, droit: Droit): boolean {
	return MATRICE[droit][role];
}

/** Règle d'une route : publique, ou gardée par un droit. */
export type RegleRoute = 'publique' | Droit;

export type DecisionRoute = 'ouvrir' | 'exiger_session' | 'refuser' | 'inconnue';

/** Refus par défaut : une route absente de la table n'est jamais servie. */
export function deciderRoute(regle: RegleRoute | undefined, role: Role | null): DecisionRoute {
	if (regle === undefined) return 'inconnue';
	if (regle === 'publique') return 'ouvrir';
	if (role === null) return 'exiger_session';
	return peut(role, regle) ? 'ouvrir' : 'refuser';
}
