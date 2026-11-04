<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, etroite = false }: { children: Snippet; etroite?: boolean } = $props();
</script>

<section class="carte" class:etroite>
	{@render children()}
</section>

<style>
	.carte {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		padding: var(--espace-5);
	}

	.etroite {
		width: min(100%, 420px);
	}
</style>
