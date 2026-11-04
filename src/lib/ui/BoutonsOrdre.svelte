<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowDown, ArrowUp } from '@lucide/svelte';

	type Props = { id: number; libelle: string; premier: boolean; dernier: boolean };
	let { id, libelle, premier, dernier }: Props = $props();
</script>

<form
	method="post"
	action="?/deplacer"
	class="ordre seulement-ordinateur"
	use:enhance={() =>
		({ update }) =>
			update({ reset: false, navigate: false })}
>
	<input type="hidden" name="id" value={id} />
	<button type="submit" name="sens" value="monter" aria-label="Monter {libelle}" disabled={premier}>
		<ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" />
	</button>
	<button
		type="submit"
		name="sens"
		value="descendre"
		aria-label="Descendre {libelle}"
		disabled={dernier}
	>
		<ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
	</button>
</form>

<style>
	.ordre {
		display: inline-flex;
		gap: 2px;
	}

	button {
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--rayon-sm);
		background: transparent;
		color: var(--primary);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--primary-soft);
	}

	button:disabled {
		color: var(--ink-disabled);
		cursor: default;
	}
</style>
