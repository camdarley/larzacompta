<script lang="ts">
	import Onglets from '#lib/ui/Onglets.svelte';

	let { children } = $props();

	const onglets = [
		{ libelle: 'Reçus', href: '/cheques' },
		{ libelle: 'Remises', href: '/cheques/remises' },
		{ libelle: 'Émis', href: '/cheques/emis' }
	];
</script>

<div class="cheques">
	<Onglets nom="Chèques" {onglets} />
	{@render children()}
</div>

<style>
	.cheques {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--espace-5);
		min-width: 0;
	}
</style>
