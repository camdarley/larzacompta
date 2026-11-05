<script lang="ts">
	import { flushSync, tick, type Snippet } from 'svelte';
	import { GLOSSAIRE } from '#lib/aide.ts';
	import { apprendre, termesVus } from './termes-vus.svelte.ts';

	let { ancre, children }: { ancre: string; children: Snippet } = $props();

	const entree = $derived(GLOSSAIRE.find((t) => t.ancre === ancre));
	const id = $derived(`aide-terme-${ancre}`);

	let ouvert = $state(false);
	let racine = $state<HTMLElement | null>(null);
	let declencheur = $state<HTMLButtonElement | null>(null);
	let lien = $state<HTMLAnchorElement | null>(null);
	/** Ouverte au clavier par Entrée : son lien s'atteint. Au simple passage de Tab, la bulle se lit. */
	let lienAtteignable = $state(false);
	let position = $state<{ left: string; top?: string; bottom?: string; width: string } | null>(
		null
	);
	let fermeture: ReturnType<typeof setTimeout> | undefined;

	function ouvrir() {
		clearTimeout(fermeture);
		if (ouvert || !declencheur) {
			ouvert = true;
			return;
		}
		const r = declencheur.getBoundingClientRect();
		const largeur = Math.min(320, window.innerWidth - 32);
		// Au-dessus du mot d'abord : en dessous, la bulle couvrirait le champ que ce mot introduit.
		const enHaut = r.top > 200 || r.bottom + 200 > window.innerHeight;
		position = {
			left: `${Math.max(16, Math.min(r.left, window.innerWidth - largeur - 16))}px`,
			width: `${largeur}px`,
			...(enHaut ? { bottom: `${window.innerHeight - r.top + 6}px` } : { top: `${r.bottom + 6}px` })
		};
		ouvert = true;
	}

	/** Une aide lue une fois ne coûte plus ni Tab ni bulle sur ce trajet (EXPERIENCE.md, Vocabulaire). */
	const connu = $derived(termesVus.has(ancre));

	function surFocus() {
		ouvrir();
		apprendre(ancre);
	}

	/** Différée : la souris a le temps de rejoindre la bulle (WCAG 1.4.13). */
	function fermerBientot() {
		clearTimeout(fermeture);
		fermeture = setTimeout(() => {
			if (!racine?.contains(document.activeElement)) ouvert = false;
		}, 150);
	}

	function surSortieFocus(e: FocusEvent) {
		if (racine?.contains(e.relatedTarget as Node)) return;
		ouvert = false;
		lienAtteignable = false;
	}

	/** `detail` nul : le clic vient d'Entrée ou d'Espace, pas de la souris. */
	async function surClic(e: MouseEvent) {
		ouvrir();
		if (e.detail !== 0) return;
		lienAtteignable = true;
		await tick();
		lien?.focus();
	}

	/** Tab repart du mot : la saisie continue au champ suivant, le lien n'est pas un cul-de-sac. */
	function surToucheLien(e: KeyboardEvent) {
		if (e.key !== 'Tab') return;
		lienAtteignable = false;
		flushSync();
		declencheur?.focus();
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Escape' && ouvert) {
			e.stopPropagation();
			ouvert = false;
			if (racine?.contains(document.activeElement)) declencheur?.focus();
			lienAtteignable = false;
		}
	}
</script>

<svelte:window onkeydowncapture={surTouche} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	class="aide-terme"
	bind:this={racine}
	onmouseenter={ouvrir}
	onmouseleave={fermerBientot}
	onfocusout={surSortieFocus}
>
	<button
		bind:this={declencheur}
		type="button"
		class="mot"
		aria-expanded={ouvert}
		aria-controls={ouvert ? id : undefined}
		tabindex={connu ? -1 : undefined}
		onfocus={surFocus}
		onclick={surClic}
	>
		{@render children()}
	</button><!-- Rien entre le mot et la suite : la ponctuation du texte doit le toucher. -->{#if ouvert && entree}
		<span
			{id}
			class="bulle"
			role="group"
			aria-label={entree.terme}
			style:left={position?.left}
			style:top={position?.top}
			style:bottom={position?.bottom}
			style:width={position?.width}
		>
			<span class="definition">{entree.definition}</span>
			<a
				bind:this={lien}
				href="/aide#terme-{ancre}"
				data-sveltekit-reload
				tabindex={lienAtteignable ? 0 : -1}
				onkeydown={surToucheLien}>En savoir plus</a
			>
		</span>
	{/if}</span
>

<style>
	.aide-terme {
		display: inline;
	}

	.mot {
		padding: 0;
		border: 0;
		border-bottom: 1px dotted var(--ink-muted);
		background: none;
		color: inherit;
		font: inherit;
		cursor: help;
	}

	/* Un mot dans le texte garde sa hauteur de ligne : sa zone de doigt déborde vers le haut,
	   côté étiquette, sans recouvrir le champ placé dessous. */
	@media (max-width: 639.98px), (pointer: coarse) {
		.mot {
			position: relative;
		}

		.mot::after {
			content: '';
			position: absolute;
			inset: -22px 0 -4px;
		}
	}

	.bulle {
		position: fixed;
		z-index: 55;
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
		box-shadow: var(--elevation-flottant);
		color: var(--ink);
		font-size: var(--typo-body-taille);
		font-weight: var(--typo-body-graisse);
		line-height: var(--typo-body-interligne);
		white-space: normal;
		text-align: left;
	}

	.bulle a {
		font-size: var(--typo-label-taille);
		font-weight: var(--typo-label-graisse);
	}
</style>
