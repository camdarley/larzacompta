<script lang="ts">
	import { urlAvec } from '#lib/ui/url.ts';

	export type OptionFiltre = { valeur: string | null; libelle: string; compteur?: number };

	type Props = { nom: string; options: readonly OptionFiltre[]; actif: string | null };

	let { nom, options, actif }: Props = $props();
</script>

<nav class="filtre" aria-label={nom}>
	<ul>
		{#each options as o (o.valeur)}
			<li>
				<a
					class="t-label"
					href={urlAvec({ etat: o.valeur })}
					aria-current={actif === o.valeur ? 'true' : undefined}
					data-sveltekit-noscroll
				>
					{o.libelle}
					{#if o.compteur !== undefined}<span class="nombre">{o.compteur}</span>{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		min-height: var(--espace-row);
		padding: 0 var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-full);
		color: var(--ink-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	a:hover {
		background: var(--surface-sunken);
		color: var(--ink);
	}

	a[aria-current='true'] {
		border-color: var(--primary);
		background: var(--primary-soft);
		color: var(--primary);
	}

	.nombre {
		font-variant-numeric: tabular-nums lining-nums;
	}

	@media (max-width: 639.98px) {
		a {
			min-height: var(--espace-touch);
		}
	}
</style>
