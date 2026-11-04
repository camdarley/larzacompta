<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variante?: 'principal' | 'secondaire' | 'discret' | 'danger';
		occupe?: boolean;
		href?: string;
		pleineLargeur?: boolean;
		/** Lien qui ouvre un `panneau` : le focus et le défilement ne bougent pas. */
		conserverFocus?: boolean;
		children: Snippet;
	};

	let {
		variante = 'principal',
		occupe = false,
		href,
		pleineLargeur = false,
		conserverFocus = false,
		type = 'button',
		children,
		onclick,
		...reste
	}: Props = $props();

	/** Reste cliquable au clavier et à la souris, mais un clic pendant l'envoi ne fait rien. */
	function surClic(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (occupe) {
			e.preventDefault();
			return;
		}
		onclick?.(e);
	}
</script>

{#if href}
	<a
		class="bouton {variante}"
		class:pleine={pleineLargeur}
		{href}
		data-sveltekit-reset={conserverFocus ? 'false' : undefined}>{@render children()}</a
	>
{:else}
	<button
		{...reste}
		{type}
		class="bouton {variante}"
		class:pleine={pleineLargeur}
		aria-busy={occupe}
		aria-disabled={occupe || undefined}
		onclick={surClic}
	>
		{#if occupe}<LoaderCircle class="tourne" size={20} strokeWidth={1.75} aria-hidden="true" />{/if}
		{@render children()}
	</button>
{/if}

<style>
	.bouton {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		padding: 0 var(--espace-4);
		border: 1px solid transparent;
		border-radius: var(--rayon-md);
		font-family: inherit;
		font-size: var(--typo-body-taille);
		font-weight: var(--typo-label-graisse);
		line-height: 1.2;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--mouvement-etat),
			border-color var(--mouvement-etat),
			color var(--mouvement-etat);
	}

	.pleine {
		width: 100%;
	}

	.principal {
		background: var(--primary);
		color: var(--on-primary);
	}

	.principal:hover {
		background: var(--primary-hover);
		color: var(--on-primary);
	}

	.secondaire {
		background: var(--surface-raised);
		border-color: var(--border-strong);
		color: var(--primary);
	}

	.secondaire:hover {
		background: var(--primary-soft);
		color: var(--primary);
	}

	.discret {
		background: transparent;
		color: var(--primary);
	}

	.discret:hover {
		background: var(--primary-soft);
		color: var(--primary);
	}

	.danger {
		background: var(--danger);
		color: var(--on-danger);
	}

	.danger:hover {
		background: color-mix(in srgb, var(--danger) 90%, var(--ink));
		color: var(--on-danger);
	}

	.bouton[aria-busy='true'] {
		cursor: progress;
	}

	.bouton :global(.tourne) {
		animation: tourne 900ms linear infinite;
	}

	@keyframes tourne {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 639.98px) {
		.bouton {
			min-height: var(--espace-touch);
		}
	}
</style>
