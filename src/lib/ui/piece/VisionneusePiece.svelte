<script lang="ts">
	import { ArrowLeft, Download, ExternalLink, FileText, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PieceJ } from '#lib/domaine/journal.ts';
	import Bouton from '#lib/ui/Bouton.svelte';

	type Props = {
		piece: Pick<PieceJ, 'sha256' | 'nomOriginal' | 'mime'>;
		/** Par-dessus le contenu du `panneau` : la saisie reste intacte dessous. */
		revenir?: () => void;
	};

	let { piece, revenir }: Props = $props();

	const pdf = $derived(piece.mime === 'application/pdf');
	const adresse = $derived(`/fichiers/${piece.sha256}`);
	let zoom = $state(false);
	let retour = $state<HTMLElement | null>(null);

	onMount(() => {
		if (revenir) retour?.querySelector('button')?.focus();
	});

	function surTouche(e: KeyboardEvent) {
		// `Échap` revient à l'Opération sans fermer le panneau. Écouté sur la fenêtre : Safari ne
		// donne pas le focus à un bouton cliqué, il peut être hors de la visionneuse.
		if (e.key === 'Escape' && revenir) {
			e.stopPropagation();
			revenir();
		}
	}
</script>

<svelte:window onkeydowncapture={surTouche} />

<div class="visionneuse" class:superposee={revenir}>
	<div class="barre">
		{#if revenir}
			<span bind:this={retour}>
				<Bouton variante="discret" onclick={revenir}>
					<ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
					Retour
				</Bouton>
			</span>
		{/if}
		{#if revenir}<p class="nom t-label">{piece.nomOriginal}</p>{/if}
		<div class="outils">
			{#if !pdf}
				<Bouton variante="discret" onclick={() => (zoom = !zoom)} aria-pressed={zoom}>
					{#if zoom}
						<ZoomOut size={20} strokeWidth={1.75} aria-hidden="true" />
						Ajuster
					{:else}
						<ZoomIn size={20} strokeWidth={1.75} aria-hidden="true" />
						Agrandir
					{/if}
				</Bouton>
			{/if}
			<Bouton variante="discret" href="{adresse}?telecharger" rechargement>
				<Download size={20} strokeWidth={1.75} aria-hidden="true" />
				Télécharger
			</Bouton>
		</div>
	</div>

	{#if pdf}
		<iframe class="seulement-ordinateur" src={adresse} title={piece.nomOriginal} loading="lazy"
		></iframe>
		<div class="sur-telephone seulement-telephone">
			<FileText size={48} strokeWidth={1.75} aria-hidden="true" />
			<a class="t-label" href={adresse} target="_blank" rel="noopener">
				<ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
				Ouvrir le PDF dans un nouvel onglet
			</a>
		</div>
	{:else}
		<div class="image" class:zoom>
			<button type="button" onclick={() => (zoom = !zoom)}>
				<img src={adresse} alt={piece.nomOriginal} />
			</button>
		</div>
	{/if}
</div>

<style>
	.visionneuse {
		display: flex;
		flex-direction: column;
		gap: var(--espace-3);
		min-height: 0;
	}

	.superposee {
		position: absolute;
		z-index: 5;
		inset: 0;
		padding: var(--espace-3) var(--espace-5) var(--espace-5);
		border-radius: inherit;
		background: var(--surface-raised);
	}

	.barre {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-1) var(--espace-2);
	}

	.nom {
		flex: 1 1 8rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.outils {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
	}

	iframe {
		flex: 1;
		width: 100%;
		min-height: 60vh;
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.sur-telephone {
		display: grid;
		justify-items: center;
		gap: var(--espace-3);
		padding: var(--espace-6) var(--espace-4);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
		color: var(--ink-muted);
		text-align: center;
	}

	.sur-telephone a {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-touch);
	}

	.image {
		flex: 1;
		min-height: 48vh;
		overflow: auto;
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.image button {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		cursor: zoom-in;
	}

	.image img {
		max-width: 100%;
		max-height: 72vh;
		object-fit: contain;
	}

	.superposee .image {
		min-height: 0;
	}

	.superposee .image img {
		max-height: 100%;
	}

	.zoom button {
		display: block;
		width: max-content;
		height: auto;
		cursor: zoom-out;
	}

	.image.zoom img,
	.superposee .image.zoom img {
		width: 200%;
		max-width: none;
		max-height: none;
	}
</style>
