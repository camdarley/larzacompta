<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Nom accessible du bouton. */
		nom: string;
		bouton: Snippet;
		children: Snippet;
		classe?: string;
		/** Sens d'ouverture : vers le bas, ou vers le haut en pied de barre. */
		sens?: 'bas' | 'haut';
	};

	let { nom, bouton, children, classe = '', sens = 'bas' }: Props = $props();

	let ouvert = $state(false);
	let racine = $state<HTMLElement | null>(null);
	let declencheur = $state<HTMLButtonElement | null>(null);

	function fermer(rendreFocus = false) {
		ouvert = false;
		if (rendreFocus) declencheur?.focus();
	}

	// Différé : retirer le menu pendant le clic annulerait l'envoi d'un formulaire qu'il contient.

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" bind:this={racine} onkeydown={surTouche} onfocusout={surSortieFocus}>
	<button
		bind:this={declencheur}
		class="declencheur {classe}"
		type="button"
		aria-label={nom}
		aria-expanded={ouvert}
		onclick={() => (ouvert = !ouvert)}
	>
		{@render bouton()}
	</button>
	{#if ouvert}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="liste {sens}" onclick={() => setTimeout(fermer)}>
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
