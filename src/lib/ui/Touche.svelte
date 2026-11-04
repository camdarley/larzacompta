<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<kbd>{@render children()}</kbd>

<style>
	kbd {
		display: inline-block;
		padding: 2px var(--espace-1);
		border: 1px solid var(--border-strong);
		border-bottom-width: 2px;
		border-radius: var(--rayon-sm);
		background: var(--surface-sunken);
		font-family: var(--typo-key-famille);
		font-size: var(--typo-key-taille);
		font-weight: var(--typo-key-graisse);
		line-height: var(--typo-key-interligne);
	}

	@media (max-width: 639.98px) {
		kbd {
			display: none;
		}
	}
</style>
