/**
 * Un menu disparaît en ouvrant son dialogue : le focus n'a plus d'origine à retrouver.
 * Le menu laisse ici son bouton, le dialogue le reprend, et le lui rend à la fermeture.
 */
let declencheur: HTMLElement | null = null;

export function noterDeclencheur(e: HTMLElement | null) {
	declencheur = e;
}

export function reprendreDeclencheur(): HTMLElement | null {
	const e = declencheur;
	declencheur = null;
	return e;
}

/** Vivante, la cible d'origine. Disparue avec sa rangée, le contenu de la page : une cible stable. */
export function rendreFocus(cible: HTMLElement | null) {
	if (cible?.isConnected) cible.focus();
	else document.getElementById('contenu')?.focus();
}
