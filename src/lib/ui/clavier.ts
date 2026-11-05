/**
 * Clavier logiciel d'un téléphone. Il ne réduit pas la fenêtre, seulement le viewport visuel :
 * une barre collée au bas de la fenêtre passerait dessous (iOS, et Android depuis Chrome 108).
 */
type ViewportVisuel = { height: number; offsetTop: number; scale: number };

/** Pixels de fenêtre masqués en bas. Un zoom réduit aussi le viewport visuel : ce n'est pas un clavier. */
export function hauteurMasquee(hauteurFenetre: number, visuel: ViewportVisuel): number {
	if (visuel.scale > 1.01) return 0;
	return Math.max(0, Math.round(hauteurFenetre - visuel.height - visuel.offsetTop));
}

/** Défilement qui amène un champ juste au-dessus de la barre, ou 0 s'il y est déjà. */
export function defilementVersChamp(basChamp: number, hautBarre: number, marge = 8): number {
	return Math.max(0, Math.ceil(basChamp - hautBarre + marge));
}

/**
 * Pose `--clavier` sur la barre, et `data-clavier` tant qu'un clavier est ouvert.
 * Le champ en cours de saisie reste visible au-dessus d'elle.
 */
export function suivreClavier(barre: HTMLElement) {
	const visuel = window.visualViewport;
	if (!visuel) return;

	function montrerChamp() {
		const champ = document.activeElement;
		if (!(champ instanceof HTMLInputElement) || !barre.hasAttribute('data-clavier')) return;
		const decalage = defilementVersChamp(
			champ.getBoundingClientRect().bottom,
			barre.getBoundingClientRect().top
		);
		if (decalage > 0) window.scrollBy({ top: decalage });
	}

	function suivre() {
		const masque = hauteurMasquee(window.innerHeight, visuel as VisualViewport);
		barre.style.setProperty('--clavier', `${masque}px`);
		barre.toggleAttribute('data-clavier', masque > 0);
		montrerChamp();
	}

	suivre();
	visuel.addEventListener('resize', suivre);
	visuel.addEventListener('scroll', suivre);
	document.addEventListener('focusin', montrerChamp);
	return {
		destroy() {
			visuel.removeEventListener('resize', suivre);
			visuel.removeEventListener('scroll', suivre);
			document.removeEventListener('focusin', montrerChamp);
		}
	};
}
