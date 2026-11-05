<script lang="ts">
	import { page } from '$app/state';
	import { Plus } from '@lucide/svelte';
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import { urlAvec } from './url.ts';
	import SelecteurExercice from './SelecteurExercice.svelte';

	type Props = {
		nomApe: string;
		exercices: Exercice[];
		exercice: Exercice | null;
		peutSaisir: boolean;
	};
	let { nomApe, exercices, exercice, peutSaisir }: Props = $props();
</script>

<header class="compact">
	<p class="t-label nom">{nomApe}</p>
	{#if exercice}
		<div class="exercice"><SelecteurExercice {exercices} {exercice} /></div>
		{#if peutSaisir && page.url.pathname !== '/operations'}
			<a
				class="nouvelle seulement-telephone"
				href={urlAvec({ op: 'nouvelle', depuis: null, rendre: null })}
				data-sveltekit-reset="false"
				aria-label="Nouvelle Opération"
			>
				<Plus size={24} strokeWidth={1.75} aria-hidden="true" />
			</a>
		{/if}
	{/if}
</header>

<style>
	.compact {
		display: none;
	}

	@media (max-width: 1023.98px) {
		.compact {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--espace-3);
			min-height: var(--espace-8);
			padding: var(--espace-2) var(--espace-page-tablet);
			background: var(--surface-sunken);
		}

		.nom {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.exercice {
			flex: none;
		}

		.nouvelle {
			display: grid;
			flex: none;
			place-items: center;
			width: var(--espace-touch);
			height: var(--espace-touch);
			border-radius: var(--rayon-md);
			background: var(--primary);
			color: var(--on-primary);
		}

		.nouvelle:hover {
			background: var(--primary-hover);
			color: var(--on-primary);
		}
	}

	@media (max-width: 639.98px) {
		.compact {
			padding: var(--espace-2) var(--espace-page-mobile);
		}
	}
</style>
