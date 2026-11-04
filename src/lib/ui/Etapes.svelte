<script lang="ts">
	import { Check } from '@lucide/svelte';

	type Etape = { libelle: string; href?: string };
	let { etapes, courante, atteinte }: { etapes: Etape[]; courante: number; atteinte: number } =
		$props();
</script>

<ol class="etapes" aria-label="Étapes de l’assistant">
	{#each etapes as e, i (e.libelle)}
		{@const n = i + 1}
		{@const faite = n < atteinte && n !== courante}
		<li
			class:en-cours={n === courante}
			class:faite
			aria-current={n === courante ? 'step' : undefined}
		>
			<span class="numero" aria-hidden="true">
				{#if faite}<Check size={16} strokeWidth={2.5} />{:else}{n}{/if}
			</span>
			{#if e.href && n <= atteinte && n !== courante}
				<a class="t-label" href={e.href}
					>{e.libelle}{#if faite}<span class="visuellement-cache"> (faite)</span>{/if}</a
				>
			{:else}
				<span class="t-label">{e.libelle}</span>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.etapes {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-2);
	}

	li {
		position: relative;
		flex: 1;
		display: grid;
		justify-items: center;
		gap: var(--espace-1);
		text-align: center;
		color: var(--ink-muted);
	}

	/* Le trait qui relie deux numéros. */
	li:not(:first-child)::before {
		content: '';
		position: absolute;
		top: 15px;
		right: calc(50% + 20px);
		left: calc(-50% + 12px);
		height: 2px;
		background: var(--border-strong);
	}

	.numero {
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 2px solid var(--border-strong);
		border-radius: var(--rayon-full);
		background: var(--surface-base);
		font-weight: var(--typo-label-graisse);
	}

	.en-cours {
		color: var(--primary);
	}

	.en-cours .numero {
		border-color: var(--primary);
		background: var(--primary);
		color: var(--on-primary);
	}

	.faite {
		color: var(--success);
	}

	.faite .numero {
		border-color: var(--success);
		color: var(--success);
	}

	a {
		min-height: var(--espace-touch);
		color: var(--success);
	}
</style>
