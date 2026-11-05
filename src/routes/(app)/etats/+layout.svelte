<script lang="ts">
	import { page } from '$app/state';
	import Onglets from '#lib/ui/Onglets.svelte';

	let { children } = $props();

	const onglets = $derived.by(() => {
		const choisi = page.url.searchParams.get('exercice');
		const q = choisi ? `?exercice=${encodeURIComponent(choisi)}` : '';
		return [
			{ libelle: 'Compte de résultat', href: `/etats${q}` },
			{ libelle: 'État de trésorerie', href: `/etats/tresorerie${q}` },
			{ libelle: 'Document d’AG', href: `/etats/document-ag${q}` }
		];
	});
</script>

<div class="etats">
	<Onglets nom="États" {onglets} />
	{@render children()}
</div>

<style>
	.etats {
		display: grid;
		gap: var(--espace-5);
		min-width: 0;
	}
</style>
