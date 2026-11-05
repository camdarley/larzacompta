<script lang="ts">
	import { FileText, ImageOff } from '@lucide/svelte';
	import type { PieceJ } from '#lib/domaine/journal.ts';

	type Props = {
		piece: Pick<PieceJ, 'sha256' | 'nomOriginal' | 'mime'>;
		/** Ouvre la visionneuse. Absent, on ne montre que la miniature. */
		ouvrir?: () => void;
		/** Ouvre une page de détail plutôt que la visionneuse. */
		href?: string;
		grand?: boolean;
	};

	let { piece, ouvrir, href, grand = false }: Props = $props();

	const pdf = $derived(piece.mime === 'application/pdf');
	const adresse = $derived(`/fichiers/${piece.sha256}`);
	const nomAction = $derived(`Ouvrir ${piece.nomOriginal}`);
	let illisible = $state(false);

	/** L'erreur d'une image rendue côté serveur a pu survenir avant l'hydratation. */
	function surveiller(image: HTMLImageElement) {
		if (image.complete && image.naturalWidth === 0) illisible = true;
	}
</script>

{#snippet miniature()}
	{#if pdf}
		<FileText size={grand ? 48 : 28} strokeWidth={1.75} aria-hidden="true" />
	{:else if illisible}
		<ImageOff size={grand ? 48 : 28} strokeWidth={1.75} aria-hidden="true" />
	{:else}
		<img src={adresse} alt="" loading="lazy" use:surveiller onerror={() => (illisible = true)} />
	{/if}
{/snippet}

{#if href}
	<a class="apercu" class:grand {href} data-sveltekit-reset="false" aria-label={nomAction}>
		{@render miniature()}
	</a>
{:else if ouvrir && pdf}
	<!-- Un PDF s'ouvre en entier dans le panneau sur ordinateur, dans un onglet sur téléphone. -->
	<button
		type="button"
		class="apercu seulement-ordinateur"
		class:grand
		aria-label={nomAction}
		onclick={ouvrir}
	>
		{@render miniature()}
	</button>
	<a
		class="apercu seulement-telephone"
		class:grand
		href={adresse}
		target="_blank"
		rel="noopener"
		aria-label={nomAction}
	>
		{@render miniature()}
	</a>
{:else if ouvrir}
	<button type="button" class="apercu" class:grand aria-label={nomAction} onclick={ouvrir}>
		{@render miniature()}
	</button>
{:else}
	<span class="apercu" class:grand>{@render miniature()}</span>
{/if}

<style>
	.apercu {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--espace-touch-large);
		height: var(--espace-touch-large);
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
		color: var(--ink-muted);
		cursor: pointer;
	}

	.grand {
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
	}

	a.apercu:hover,
	button.apercu:hover {
		border-color: var(--primary);
		color: var(--primary);
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
