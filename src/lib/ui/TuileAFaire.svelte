<script lang="ts">
	import { Check, ChevronRight } from '@lucide/svelte';
	import type { Component } from 'svelte';

	type Props = {
		libelle: string;
		compteur: number;
		icone: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: 'true' }>;
		/** Absent si le rôle n'atteint pas la liste : le compteur reste, sans lien. */
		href?: string | null;
	};
	let { libelle, compteur, icone: Icone, href = null }: Props = $props();
</script>

{#snippet contenu()}
	<span class="icone"><Icone size={20} strokeWidth={1.75} aria-hidden="true" /></span>
	<span class="libelle">{libelle}</span>
	{#if compteur === 0}
		<span class="zero">
			<Check size={18} strokeWidth={2} aria-hidden="true" />
			<span class="visuellement-cache">Rien à faire</span>
		</span>
	{:else}
		<span class="compteur t-label">{compteur}</span>
	{/if}
	{#if href}<ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />{/if}
{/snippet}

{#if href}
	<a class="tuile" class:vide={compteur === 0} {href}>{@render contenu()}</a>
{:else}
	<div class="tuile" class:vide={compteur === 0}>{@render contenu()}</div>
{/if}

<style>
	.tuile {
		display: flex;
		align-items: center;
		gap: var(--espace-3);
		min-height: var(--espace-touch);
		padding: var(--espace-2) var(--espace-3);
		color: var(--ink);
		text-decoration: none;
	}

	a.tuile:hover {
		background: var(--surface-sunken);
	}

	.icone {
		display: inline-flex;
		color: var(--primary);
	}

	.libelle {
		flex: 1;
		min-width: 0;
	}

	.vide {
		color: var(--ink-muted);
	}

	.vide .icone {
		color: var(--ink-muted);
	}

	.zero {
		display: inline-flex;
		color: var(--success);
	}

	.compteur {
		font-variant-numeric: tabular-nums lining-nums;
	}
</style>
