<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	type Props = {
		titre: string;
		phrase: string;
		icone: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: 'true' }>;
		action?: Snippet;
		/** Un écran de bienvenue porte le `h1` de la page. */
		principal?: boolean;
	};

	let { titre, phrase, icone: Icone, action, principal = false }: Props = $props();
</script>

<div class="etat-vide">
	<Icone size={40} strokeWidth={1.75} aria-hidden="true" />
	{#if principal}
		<h1 class="t-title" tabindex="-1">{titre}</h1>
	{:else}
		<h2 class="t-title">{titre}</h2>
	{/if}
	<p>{phrase}</p>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.etat-vide {
		display: grid;
		justify-items: center;
		gap: var(--espace-2);
		padding: var(--espace-7) var(--espace-4);
		text-align: center;
		color: var(--ink-muted);
	}

	h1,
	h2 {
		color: var(--ink);
	}

	p {
		max-width: 44ch;
	}

	.action {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--espace-2);
		margin-top: var(--espace-3);
	}
</style>
