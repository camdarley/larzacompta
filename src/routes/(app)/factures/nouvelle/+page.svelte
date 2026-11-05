<script lang="ts">
	import EditionFacture from '#lib/ui/facture/EditionFacture.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';

	let { data } = $props();
</script>

<ReserveOrdinateur />

<div class="seulement-ordinateur">
	<EditionFacture
		facture={null}
		actions={data.actions}
		tiers={data.tiers}
		mentions={data.mentions}
		dateParDefaut={data.dateParDefaut}
	/>
</div>
