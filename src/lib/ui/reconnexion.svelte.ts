/** Session expirée : un seul `dialogue`, ouvert par n'importe quelle surface (AD-14). */
export const reconnexion = $state({ ouverte: false, apres: null as (() => void) | null });

export function demanderReconnexion(apres?: () => void) {
	reconnexion.apres = apres ?? null;
	reconnexion.ouverte = true;
}
