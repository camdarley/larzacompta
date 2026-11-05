<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Bouton from './Bouton.svelte';
	import { suivreClavierPanneau } from './clavier.ts';

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
		/** Le focus va au premier champ : ce dialogue demande une saisie, pas une confirmation. */
		saisie?: boolean;
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
		saisie = false,
		actionPerso
	}: Props = $props();

	let boutonRevenir = $state<HTMLElement | null>(null);
	let contenu = $state<HTMLElement | null>(null);

	$effect(() => {
		const panneau = contenu?.parentElement;
		return panneau ? suivreClavierPanneau(panneau) : undefined;
	});
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
				const champ = saisie ? contenu?.querySelector('input') : null;
				(champ ?? boutonRevenir?.querySelector('button'))?.focus();
			}}
		>
			<Dialog.Title class="t-title ape-dialogue-titre">{titre}</Dialog.Title>
			<div bind:this={contenu}>
				<Dialog.Description class="ape-dialogue-texte">{@render children()}</Dialog.Description>
			</div>
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
			bottom: var(--clavier, 0px);
			max-height: calc(var(--hauteur-visible, 100dvh) - var(--espace-page-mobile));
			left: 0;
			transform: none;
			width: 100%;
			border-radius: var(--rayon-xl) var(--rayon-xl) 0 0;
			padding-bottom: calc(var(--espace-5) + env(safe-area-inset-bottom));
		}
	}
</style>
