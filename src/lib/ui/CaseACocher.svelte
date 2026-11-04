<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		name: string;
		value?: string;
		coche?: boolean;
		aide?: string;
		id?: string;
		children: Snippet;
	};

	let { name, value = 'on', coche = $bindable(false), aide, id, children }: Props = $props();
	const idAuto = $derived(id ?? `case-${name}-${value}`);
</script>

<div class="case">
	<input id={idAuto} type="checkbox" {name} {value} bind:checked={coche} />
	<label for={idAuto}>
		{@render children()}
		{#if aide}<span class="aide t-caption">{aide}</span>{/if}
	</label>
</div>

<style>
	.case {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		padding: var(--espace-2) 0;
	}

	input {
		flex: none;
		width: 20px;
		height: 20px;
		margin: 2px 0 0;
		accent-color: var(--primary);
	}

	label {
		display: grid;
		cursor: pointer;
	}

	.aide {
		color: var(--ink-muted);
	}
</style>
