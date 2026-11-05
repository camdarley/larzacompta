/**
 * Clavier logiciel d'un téléphone. Il ne réduit pas la fenêtre, seulement le viewport visuel :
 * une barre collée au bas de la fenêtre passerait dessous (iOS, et Android depuis Chrome 108).
 */
type ViewportVisuel = { height: number; offsetTop: number; scale: number };

/** Hauteur du clavier. Un zoom réduit aussi le viewport visuel : ce n'est pas un clavier. */
export function hauteurClavier(hauteurFenetre: number, visuel: ViewportVisuel): number {
	if (visuel.scale > 1.01) return 0;
	return Math.max(0, Math.round(hauteurFenetre - visuel.height));
}

/** Pixels de fenêtre masqués en bas : iOS décale le viewport visuel, et ce décalage en découvre. */
export function hauteurMasquee(hauteurFenetre: number, visuel: ViewportVisuel): number {
	return Math.max(0, hauteurClavier(hauteurFenetre, visuel) - Math.round(visuel.offsetTop));
}

/** Défilement qui amène un champ au-dessus de la barre, ou 0 s'il y est déjà. */
export function defilementVersChamp(basChamp: number, hautBarre: number, marge = 8): number {
	return Math.max(0, Math.ceil(basChamp - hautBarre + marge));
}

/**
 * Les champs suivants doivent rester découverts : la touche Suivant de Safari saute ceux que la
 * barre couvre, et se bloque avant les derniers. Il décide au focus, avant notre défilement :
 * d'où deux champs d'avance, et non un.
 */
const CHAMPS_D_AVANCE = 2;
/** Réserve au-delà du clavier : en butant sur la fin de page, Safari replie sa barre d'outils. */
const MARGE_FIN_DE_PAGE = 128;
const REPRISE_APRES_SAFARI = 250;

/**
 * Pose `--clavier` sur la barre, et `data-clavier` tant qu'un clavier est ouvert. Son parent
 * reçoit `--reserve-clavier`, à garder en marge basse : sans elle, la page ne défile plus assez
 * pour amener les derniers champs au-dessus de la barre.
 */
export function suivreClavier(barre: HTMLElement) {
	const visuel = window.visualViewport;
	if (!visuel) return;

	function montrerChamp() {
		const champ = document.activeElement;
		if (!(champ instanceof HTMLInputElement) || !barre.hasAttribute('data-clavier')) return;
		const champs = [...(barre.parentElement?.querySelectorAll('input') ?? [])];
		const rang = champs.indexOf(champ);
		const vise = champs[Math.min(rang + CHAMPS_D_AVANCE, champs.length - 1)] ?? champ;
		const decalage = defilementVersChamp(
			vise.getBoundingClientRect().bottom,
			barre.getBoundingClientRect().top
		);
		if (decalage > 0) window.scrollBy({ top: decalage });
	}

	function suivre() {
		const masque = hauteurMasquee(window.innerHeight, visuel as VisualViewport);
		const reserve = hauteurClavier(window.innerHeight, visuel as VisualViewport);
		barre.style.setProperty('--clavier', `${masque}px`);
		barre.parentElement?.style.setProperty(
			'--reserve-clavier',
			reserve > 0 ? `${reserve + MARGE_FIN_DE_PAGE}px` : '0px'
		);
		barre.toggleAttribute('data-clavier', reserve > 0);
	}

	function clavierChange() {
		suivre();
		montrerChamp();
	}

	// Safari replace le champ après `focusin` : on repasse une fois son mouvement fini. Pas sur
	// `scroll`, qui ramènerait le champ dès qu'on fait défiler la page au doigt.
	let reprise: ReturnType<typeof setTimeout> | undefined;
	function champChange() {
		montrerChamp();
		clearTimeout(reprise);
		reprise = setTimeout(montrerChamp, REPRISE_APRES_SAFARI);
	}

	clavierChange();
	visuel.addEventListener('resize', clavierChange);
	visuel.addEventListener('scroll', suivre);
	document.addEventListener('focusin', champChange);
	return {
		destroy() {
			clearTimeout(reprise);
			visuel.removeEventListener('resize', clavierChange);
			visuel.removeEventListener('scroll', suivre);
			document.removeEventListener('focusin', champChange);
		}
	};
}

/**
 * Garde un panneau fixé en bas d'écran au-dessus du clavier : le navigateur ne décale la page que
 * pour montrer le champ, et laisserait dessous les boutons du panneau.
 */
export function suivreClavierPanneau(panneau: HTMLElement) {
	const visuel = window.visualViewport;
	if (!visuel) return;

	function suivre() {
		const masque = hauteurMasquee(window.innerHeight, visuel as VisualViewport);
		panneau.style.setProperty('--clavier', `${masque}px`);
		panneau.style.setProperty(
			'--hauteur-visible',
			`${Math.round((visuel as VisualViewport).height)}px`
		);
	}

	suivre();
	visuel.addEventListener('resize', suivre);
	visuel.addEventListener('scroll', suivre);
	return () => {
		visuel.removeEventListener('resize', suivre);
		visuel.removeEventListener('scroll', suivre);
	};
}
