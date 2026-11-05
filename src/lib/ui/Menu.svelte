<script lang="ts">
	import type { Snippet } from 'svelte';
	import { noterDeclencheur, rendreFocus } from './retour-focus.ts';

	type Props = {
		/** Nom accessible du bouton. */
		nom: string;
		bouton: Snippet;
		children: Snippet;
		classe?: string;
		/** Sens d'ouverture : vers le bas, ou vers le haut en pied de barre. */
		sens?: 'bas' | 'haut';
		/** Dans une zone qui défile : la liste flotte au-dessus, alignée à droite du bouton. */
		flottant?: boolean;
	};

	let { nom, bouton, children, classe = '', sens = 'bas', flottant = false }: Props = $props();

	let ouvert = $state(false);
	let racine = $state<HTMLElement | null>(null);
	let declencheur = $state<HTMLButtonElement | null>(null);

	let position = $state<{ top?: string; bottom?: string; right: string } | null>(null);

	function basculer() {
		ouvert = !ouvert;
		if (!ouvert || !flottant || !declencheur) return;
		const r = declencheur.getBoundingClientRect();
		const marge = 4;
		const enHaut = r.bottom + 240 > window.innerHeight;
		position = {
			right: `${window.innerWidth - r.right}px`,
			...(enHaut
				? { bottom: `${window.innerHeight - r.top + marge}px` }
				: { top: `${r.bottom + marge}px` })
		};
	}

	function fermer(rendreFocus = false) {
		ouvert = false;
		if (rendreFocus) declencheur?.focus();
	}

	/**
	 * Différé : retirer le menu pendant le clic annulerait l'envoi d'un formulaire qu'il contient.
	 * Sans dialogue ni navigation, le focus n'aurait plus nulle part où être : il revient au bouton.
	 */
	function apresChoix() {
		setTimeout(() => {
			fermer();
			noterDeclencheur(null);
			if (document.activeElement === document.body) rendreFocus(declencheur);
		});
	}

	/** Sur la fenêtre : Safari ne donne pas le focus à un bouton cliqué, ni donc à ce menu. */
	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Escape' && ouvert) {
			e.stopPropagation();
			fermer(true);
		}
	}

	function surClicDocument(e: MouseEvent) {
		if (ouvert && !racine?.contains(e.target as Node)) fermer();
	}

	function surSortieFocus(e: FocusEvent) {
		if (ouvert && !racine?.contains(e.relatedTarget as Node)) fermer();
	}
</script>

<svelte:document onclick={surClicDocument} />
<svelte:window onkeydowncapture={surTouche} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" bind:this={racine} onfocusout={surSortieFocus}>
	<button
		bind:this={declencheur}
		class="declencheur {classe}"
		type="button"
		aria-label={nom}
		aria-expanded={ouvert}
		onclick={basculer}
	>
		{@render bouton()}
	</button>
	{#if ouvert}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="liste {sens}"
			class:flottant
			style:top={position?.top}
			style:bottom={position?.bottom}
			style:right={position?.right}
			onclickcapture={() => noterDeclencheur(declencheur)}
			onclick={apresChoix}
		>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.menu {
		position: relative;
		min-width: 0;
	}

	.declencheur {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		width: 100%;
		min-height: var(--espace-row);
		padding: var(--espace-1) var(--espace-2);
		border: 1px solid transparent;
		border-radius: var(--rayon-md);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.liste {
		position: absolute;
		z-index: 30;
		left: 0;
		min-width: 100%;
		width: max-content;
		max-width: min(280px, calc(100vw - 2 * var(--espace-4)));
		padding: var(--espace-1);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
		box-shadow: var(--elevation-flottant);
	}

	.liste.flottant {
		position: fixed;
		left: auto;
		top: auto;
		bottom: auto;
		min-width: 220px;
	}

	.bas {
		top: calc(100% + var(--espace-1));
	}

	.haut {
		bottom: calc(100% + var(--espace-1));
	}

	.liste :global(a),
	.liste :global(button) {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		width: 100%;
		min-height: var(--espace-row);
		padding: var(--espace-1) var(--espace-3);
		border: 0;
		border-radius: var(--rayon-sm);
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.liste :global(a:hover),
	.liste :global(button:hover) {
		background: var(--primary-soft);
		color: var(--primary);
	}
</style>
