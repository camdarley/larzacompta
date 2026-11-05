<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { RACCOURCIS } from '#lib/aide.ts';
	import Bouton from './Bouton.svelte';
	import Touche from './Touche.svelte';

	let { ouvert = $bindable(false) }: { ouvert?: boolean } = $props();
</script>

<Dialog.Root bind:open={ouvert}>
	<Dialog.Portal>
		<Dialog.Overlay class="ape-voile ape-voile-haut" />
		<Dialog.Content class="ape-dialogue">
			<Dialog.Title class="t-title">Raccourcis du clavier</Dialog.Title>
			<Dialog.Description class="ape-dialogue-texte">
				Une touche seule n’agit jamais pendant une saisie.
			</Dialog.Description>
			<ul class="liste">
				{#each RACCOURCIS as r (r.touche)}
					<li><span><Touche contenu>{r.touche}</Touche></span><span>{r.effet}</span></li>
				{/each}
			</ul>
			<div class="ape-dialogue-actions">
				<a class="t-label plus" href="/aide#raccourcis" onclick={() => (ouvert = false)}>
					Toute l’aide
				</a>
				<Bouton variante="secondaire" onclick={() => (ouvert = false)}>Fermer</Bouton>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.liste {
		display: grid;
		gap: var(--espace-1);
		margin-top: var(--espace-3);
	}

	li {
		display: grid;
		grid-template-columns: 112px minmax(0, 1fr);
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
	}

	.plus {
		align-self: center;
		margin-right: auto;
	}
</style>
