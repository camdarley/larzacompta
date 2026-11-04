<script lang="ts">
	import { page } from '$app/state';
	import { Check, ChevronsUpDown } from '@lucide/svelte';
	import type { Exercice } from '#lib/domaine/exercices.ts';
	import Menu from './Menu.svelte';
	import Pastille from './Pastille.svelte';

	let { exercices, exercice }: { exercices: Exercice[]; exercice: Exercice } = $props();

	/** Changer d'Exercice garde l'écran courant : seul le paramètre d'URL change. */
	function lien(e: Exercice) {
		const url = new URL(page.url.href);
		url.searchParams.set('exercice', e.libelle);
		url.searchParams.delete('page');
		return url.pathname + url.search;
	}
</script>

<Menu
	nom="{exercice.libelle} {exercice.statut === 'cloture'
		? 'Clôturé'
		: 'Ouvert'}, changer d’Exercice"
	classe="selecteur-exercice"
>
	{#snippet bouton()}
		<span class="libelle t-label">{exercice.libelle}</span>
		<Pastille etat={exercice.statut === 'cloture' ? 'cloture' : 'ouvert'} />
		<ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
	{/snippet}
	{#each exercices as e (e.id)}
		<a
			href={lien(e)}
			aria-current={e.id === exercice.id ? 'true' : undefined}
			data-sveltekit-reset="false"
		>
			<span class="option">{e.libelle}</span>
			{#if e.id === exercice.id}<Check size={16} strokeWidth={2} aria-hidden="true" />{/if}
		</a>
	{/each}
</Menu>

<style>
	:global(.selecteur-exercice) {
		background: var(--surface-raised) !important;
		border-color: var(--border) !important;
		color: var(--ink);
	}

	:global(.selecteur-exercice:hover) {
		border-color: var(--border-strong) !important;
	}

	.libelle {
		flex: 1;
	}

	.option {
		flex: 1;
	}
</style>
