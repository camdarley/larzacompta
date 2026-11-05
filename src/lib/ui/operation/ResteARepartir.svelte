<script lang="ts">
	import { Check, CircleAlert } from '@lucide/svelte';
	import { formaterMontant, centimes, type Centimes } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';

	type Props = {
		reste: Centimes;
		ajouter?: () => void;
		zone?: HTMLElement | null;
	};

	let { reste, ajouter, zone = $bindable(null) }: Props = $props();

	const fini = $derived(reste === 0);
	const trop = $derived(reste < 0);
	const montant = $derived(formaterMontant(centimes(Math.abs(reste))));
	const texte = $derived(
		fini ? 'Tout est réparti' : trop ? `${montant} de trop` : `Reste à répartir : ${montant}`
	);

	// Annonce polie, 1 s après la frappe : un lecteur d'écran n'épelle pas chaque chiffre.
	let annonce = $state('');
	$effect(() => {
		const t = texte;
		const minuterie = setTimeout(() => (annonce = t), 1000);
		return () => clearTimeout(minuterie);
	});
</script>

<div class="reste" class:fini class:trop bind:this={zone} tabindex="-1" data-testid="reste">
	{#if fini}
		<Check size={20} strokeWidth={2} aria-hidden="true" />
		<p class="t-label">{texte}</p>
	{:else if trop}
		<CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
		<p class="montant-lg">{texte}</p>
	{:else}
		<p class="libelle">
			<span class="t-label t-muted">Reste à répartir</span>
			<span class="montant-lg">{montant}</span>
		</p>
		{#if ajouter}
			<Bouton variante="secondaire" onclick={ajouter}>Ajouter une Ligne de {montant}</Bouton>
		{/if}
	{/if}
	<span class="visuellement-cache" aria-live="polite">{annonce}</span>
</div>

<style>
	.reste {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-2) var(--espace-3);
		min-height: var(--espace-8);
		padding: var(--espace-2) var(--espace-5);
		background: var(--surface-sunken);
		outline-offset: -2px;
	}

	.libelle {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: var(--espace-2);
	}

	.fini {
		background: var(--success-soft);
		color: var(--success);
	}

	.trop {
		background: var(--warning-soft);
		color: var(--ink);
	}

	.trop :global(svg) {
		color: var(--warning);
	}

	@media (max-width: 639.98px) {
		.reste {
			padding-inline: var(--espace-page-mobile);
		}

		.reste :global(button) {
			width: 100%;
		}
	}
</style>
