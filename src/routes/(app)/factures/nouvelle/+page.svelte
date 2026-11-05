<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import EditionFacture from '#lib/ui/facture/EditionFacture.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';

	let { data } = $props();
</script>

<!-- Le titre de l'écran vit dans EditionFacture, masqué sur téléphone : celui-ci le remplace. -->
<div class="seulement-telephone telephone">
	<a class="retour" href="/factures">
		<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
		Toutes les Factures
	</a>
	<h1 class="t-title" tabindex="-1">Nouvelle facture</h1>
	<ReserveOrdinateur />
</div>

<div class="seulement-ordinateur">
	<EditionFacture
		facture={null}
		actions={data.actions}
		tiers={data.tiers}
		mentions={data.mentions}
		dateParDefaut={data.dateParDefaut}
	/>
</div>

<style>
	.telephone {
		display: grid;
		gap: var(--espace-3);
	}

	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		min-height: var(--espace-row);
	}
</style>
