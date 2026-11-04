<script lang="ts">
	import { Laptop } from '@lucide/svelte';
	import { TEXTES } from '#lib/messages.ts';
</script>

<p class="seulement-telephone reserve">
	<Laptop size={20} strokeWidth={1.75} aria-hidden="true" />
	{TEXTES.sur_ordinateur}
</p>

<style>
	.reserve {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
		color: var(--ink-muted);
	}
</style>
