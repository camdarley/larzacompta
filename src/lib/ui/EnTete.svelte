<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import AideTerme from './AideTerme.svelte';

	type Props = {
		titre: string;
		/** Complète le titre de l'onglet : « Comptes, Réglages ». */
		contexte?: string;
		/** Précède le titre dans l'onglet, quand une page en a plusieurs : « Toutes, Pièces ». */
		onglet?: string;
		sousTitre?: string;
		/** `title` au lieu de `display` : page dans une carte. */
		petit?: boolean;
		/** Ne rend que le `<title>`, quand un autre élément porte le `h1`. */
		sansTitre?: boolean;
		/** Terme du Glossaire que cet écran introduit : la bulle s'ouvre sous le titre. */
		aide?: { ancre: string; texte: string };
		actions?: Snippet;
	};

	let {
		titre,
		contexte,
		onglet,
		sousTitre,
		petit = false,
		sansTitre = false,
		aide,
		actions
	}: Props = $props();

	const titreOnglet = $derived(
		[onglet, titre, contexte, page.data.nomApe as string | undefined].filter(Boolean).join(', ')
	);
</script>

<svelte:head>
	<title>{titreOnglet}</title>
</svelte:head>

{#if !sansTitre}
	<header class="entete">
		<div>
			<h1 class={petit ? 't-title' : 't-display'} tabindex="-1">{titre}</h1>
			{#if sousTitre || aide}
				<p class="sous-titre t-muted">
					{sousTitre}
					{#if aide}<AideTerme ancre={aide.ancre}>{aide.texte}</AideTerme>{/if}
				</p>
			{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</header>
{/if}

<style>
	.entete {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--espace-3) var(--espace-5);
	}

	.sous-titre {
		margin-top: var(--espace-2);
		max-width: var(--espace-reading-max);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
	}
</style>
