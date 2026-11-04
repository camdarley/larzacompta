<script lang="ts">
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import SelecteurExercice from './SelecteurExercice.svelte';

	type Props = { nomApe: string; exercices: Exercice[]; exercice: Exercice | null };
	let { nomApe, exercices, exercice }: Props = $props();
</script>

<header class="compact">
	<p class="t-label nom">{nomApe}</p>
	{#if exercice}
		<div class="exercice"><SelecteurExercice {exercices} {exercice} /></div>
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
	}

	@media (max-width: 639.98px) {
		.compact {
			padding: var(--espace-2) var(--espace-page-mobile);
		}
	}
</style>
