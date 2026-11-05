<script lang="ts">
	import { lireMarkdown, type Morceau } from './markdown.ts';

	let { source }: { source: string } = $props();
	const blocs = $derived(lireMarkdown(source));
</script>

{#snippet texte(morceaux: Morceau[])}
	{#each morceaux as m, i (i)}
		{#if m.type === 'code'}<code>{m.texte}</code>{:else if m.type === 'gras'}<strong
				>{m.texte}</strong
			>{:else}{m.texte}{/if}
	{/each}
{/snippet}

<article class="documentation">
	{#each blocs as b, i (i)}
		{#if b.type === 'titre'}
			<svelte:element this={`h${b.niveau}`} class="t-heading">
				{@render texte(b.morceaux)}
			</svelte:element>
		{:else if b.type === 'paragraphe'}
			<p>{@render texte(b.morceaux)}</p>
		{:else if b.type === 'code'}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<pre tabindex="0"><code>{b.texte}</code></pre>
		{:else}
			<svelte:element this={b.ordonnee ? 'ol' : 'ul'}>
				{#each b.elements as e, j (j)}
					<li>{@render texte(e)}</li>
				{/each}
			</svelte:element>
		{/if}
	{/each}
</article>

<style>
	.documentation {
		display: grid;
		gap: var(--espace-3);
		max-width: var(--espace-reading-max);
		min-width: 0;
		color: var(--ink);
	}

	.documentation :global(h2),
	.documentation :global(h3) {
		margin-top: var(--espace-3);
	}

	ol,
	ul {
		display: grid;
		gap: var(--espace-1);
		padding-left: var(--espace-5);
	}

	ol {
		list-style: decimal;
	}

	ul {
		list-style: disc;
	}

	code {
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
	}

	pre {
		overflow-x: auto;
		padding: var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	pre code {
		overflow-wrap: normal;
	}
</style>
