<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Bouton from './Bouton.svelte';

	type Props = {
		ouvert: boolean;
		titre: string;
		/** Libellé explicite de l'action, jamais « OK ». */
		libelleAction: string;
		danger?: boolean;
		occupe?: boolean;
		confirmer: () => void;
		revenir: () => void;
		libelleRevenir?: string;
		children: Snippet;
		/** Si l'action est un envoi de formulaire, il fournit son propre bouton. */
		actionPerso?: Snippet;
	};

	let {
		ouvert,
		titre,
		libelleAction,
		danger = false,
		occupe = false,
		confirmer,
		revenir,
		libelleRevenir = 'Revenir',
		children,
		actionPerso
	}: Props = $props();

	let boutonRevenir = $state<HTMLElement | null>(null);
</script>

<Dialog.Root
	bind:open={
		() => ouvert,
		(o) => {
			if (!o) revenir();
		}
	}
>
	<Dialog.Portal>
		<Dialog.Overlay class="ape-voile ape-voile-haut" />
		<Dialog.Content
			class="ape-dialogue"
			onOpenAutoFocus={(e) => {
				// Le focus initial reste sur « Revenir » pour une action qui engage.
				e.preventDefault();
				boutonRevenir?.querySelector('button')?.focus();
			}}
		>
			<Dialog.Title class="t-title ape-dialogue-titre">{titre}</Dialog.Title>
			<Dialog.Description class="ape-dialogue-texte">{@render children()}</Dialog.Description>
			<div class="ape-dialogue-actions">
				<span bind:this={boutonRevenir}>
					<Bouton variante="secondaire" onclick={revenir}>{libelleRevenir}</Bouton>
				</span>
				{#if actionPerso}
					{@render actionPerso()}
				{:else}
					<Bouton variante={danger ? 'danger' : 'principal'} {occupe} onclick={confirmer}>
						{libelleAction}
					</Bouton>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.ape-voile) {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: var(--elevation-voile);
	}

	:global(.ape-voile-haut) {
		z-index: 50;
	}

	:global(.ape-dialogue) {
		position: fixed;
		z-index: 51;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 2 * var(--espace-page-mobile)));
		max-height: calc(100dvh - 2 * var(--espace-page-mobile));
		overflow-y: auto;
		padding: var(--espace-5);
		border-radius: var(--rayon-xl);
		background: var(--surface-raised);
		box-shadow: var(--elevation-superpose);
	}

	:global(.ape-dialogue-texte) {
		margin-top: var(--espace-3);
	}

	:global(.ape-dialogue-actions) {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--espace-2);
		margin-top: var(--espace-5);
	}

	@media (max-width: 639.98px) {
		:global(.ape-dialogue) {
			top: auto;
			bottom: 0;
			left: 0;
			transform: none;
			width: 100%;
			border-radius: var(--rayon-xl) var(--rayon-xl) 0 0;
			padding-bottom: calc(var(--espace-5) + env(safe-area-inset-bottom));
		}
	}
</style>
