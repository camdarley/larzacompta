<script lang="ts">
	import { CircleAlert, Info, Lock, TriangleAlert } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		ton?: 'info' | 'regarder' | 'erreur' | 'fige';
		/** Erreur bloquante : annoncée tout de suite. */
		alerte?: boolean;
		action?: Snippet;
		children: Snippet;
	};

	let { ton = 'info', alerte = false, action, children }: Props = $props();
	const Icone = $derived(
		{ info: Info, regarder: TriangleAlert, erreur: CircleAlert, fige: Lock }[ton]
	);
</script>

<div class="bandeau {ton}" role={alerte ? 'alert' : undefined}>
	<Icone size={20} strokeWidth={1.75} aria-hidden="true" />
	<div class="texte">{@render children()}</div>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.bandeau {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-3);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		color: var(--ink);
	}

	.bandeau > :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.texte {
		flex: 1;
		min-width: 0;
	}

	.info {
		background: var(--primary-soft);
	}

	.info > :global(svg) {
		color: var(--primary);
	}

	.regarder {
		background: var(--warning-soft);
	}

	.regarder > :global(svg) {
		color: var(--warning);
	}

	.erreur {
		background: var(--danger-soft);
	}

	.erreur > :global(svg) {
		color: var(--danger);
	}

	.fige {
		background: var(--surface-sunken);
	}

	.fige > :global(svg) {
		color: var(--ink-muted);
	}
</style>
