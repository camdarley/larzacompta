<script lang="ts">
	import { Check, ChevronDown, Columns3 } from '@lucide/svelte';
	import { basculerComparaison } from '#lib/domaine/etats/comparaison.ts';
	import Menu from '#lib/ui/Menu.svelte';
	import { urlAvec } from '#lib/ui/url.ts';

	type Props = {
		/** Libellés des Exercices tenus, le plus récent d'abord. */
		comparables: readonly string[];
		choisis: readonly { libelle: string }[];
	};
	let { comparables, choisis }: Props = $props();

	const lien = (libelle: string) => urlAvec({ comparer: basculerComparaison(choisis, libelle) });
	const estChoisi = (libelle: string) => choisis.some((c) => c.libelle === libelle);
	const resume = $derived(choisis.map((c) => c.libelle).join(', '));
</script>

<!-- Sur téléphone, les colonnes de comparaison sont masquées : le choix n'y aurait aucun effet. -->
{#if comparables.length > 0}
	<div class="seulement-ordinateur">
		<Menu
			nom={resume === '' ? 'Comparer à' : `Comparer à : ${resume}`}
			classe="bouton-exporter"
			flottant
		>
			{#snippet bouton()}
				<Columns3 size={20} strokeWidth={1.75} aria-hidden="true" />
				<span>Comparer à{choisis.length > 0 ? ` (${choisis.length})` : ''}</span>
				<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
			{/snippet}
			{#each comparables as libelle (libelle)}
				<a
					href={lien(libelle)}
					aria-current={estChoisi(libelle) ? 'true' : undefined}
					data-sveltekit-reset="false"
					data-sveltekit-noscroll
				>
					<span class="option">{libelle}</span>
					{#if estChoisi(libelle)}<Check size={16} strokeWidth={2} aria-hidden="true" />{/if}
				</a>
			{/each}
		</Menu>
	</div>
{/if}

<style>
	.option {
		flex: 1;
	}
</style>
