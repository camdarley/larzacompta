<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { TEXTES } from '#lib/messages.ts';
	import Dialogue from './Dialogue.svelte';

	type Props = {
		ouvert: boolean;
		titre: string;
		fermer: () => void;
		children: Snippet;
		pied?: Snippet;
	};

	let { ouvert, titre, fermer, children, pied }: Props = $props();

	/** Une saisie commencée ne se perd pas sur un geste malheureux (EXPERIENCE.md). */
	let modifie = $state(false);
	let confirmation = $state(false);
	let corps = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!ouvert) {
			modifie = false;
			confirmation = false;
		}
	});

	function demanderFermeture() {
		if (modifie) confirmation = true;
		else fermer();
	}
</script>

<!-- L'URL décide : Bits UI demande la fermeture, il ne la fait pas seul. -->
<Dialog.Root
	bind:open={
		() => ouvert,
		(o) => {
			if (!o) demanderFermeture();
		}
	}
>
	<Dialog.Portal>
		<Dialog.Overlay class="ape-voile" />
		<Dialog.Content
			class="ape-panneau"
			onOpenAutoFocus={(e) => {
				// Le premier champ plutôt que la croix : on ouvre un panneau pour y saisir.
				const champ = corps?.querySelector<HTMLElement>(
					'input:not([type=hidden]), select, textarea'
				);
				if (champ) {
					e.preventDefault();
					champ.focus();
				}
			}}
		>
			<header class="tete">
				<Dialog.Title class="t-title">{titre}</Dialog.Title>
				<button class="croix" type="button" aria-label="Fermer" onclick={demanderFermeture}>
					<X size={20} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</header>
			<div class="corps" bind:this={corps} oninput={() => (modifie = true)}>
				{@render children()}
			</div>
			{#if pied}<footer class="pied">{@render pied()}</footer>{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialogue
	ouvert={confirmation}
	titre={TEXTES.quitter_sans_enregistrer}
	libelleAction="Quitter sans enregistrer"
	libelleRevenir="Continuer la saisie"
	danger
	confirmer={() => {
		confirmation = false;
		fermer();
	}}
	revenir={() => (confirmation = false)}
>
	Ce que vous venez de saisir sera perdu.
</Dialogue>

<style>
	:global(.ape-panneau) {
		position: fixed;
		z-index: 41;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		width: min(var(--espace-drawer), 100vw);
		border-radius: var(--rayon-xl) 0 0 var(--rayon-xl);
		background: var(--surface-raised);
		box-shadow: var(--elevation-superpose);
		animation: glisse var(--mouvement-panneau) ease-out;
	}

	@keyframes glisse {
		from {
			transform: translateX(var(--espace-6));
			opacity: 0;
		}
	}

	.tete {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		padding: var(--espace-4) var(--espace-5);
		border-bottom: 1px solid var(--border);
	}

	.croix {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--espace-touch);
		height: var(--espace-touch);
		margin-right: calc(-1 * var(--espace-3));
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.croix:hover {
		background: var(--surface-sunken);
		color: var(--ink);
	}

	.corps {
		flex: 1;
		overflow-y: auto;
		padding: var(--espace-5);
	}

	.pied {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
		padding: var(--espace-3) var(--espace-5);
		border-top: 1px solid var(--border);
		padding-bottom: calc(var(--espace-3) + env(safe-area-inset-bottom));
	}

	@media (max-width: 639.98px) {
		:global(.ape-panneau) {
			width: 100vw;
			border-radius: 0;
		}
	}
</style>
