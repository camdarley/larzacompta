<script lang="ts">
	import { page } from '$app/state';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Onglets from '#lib/ui/Onglets.svelte';

	let { manquantes, toutes }: { manquantes: number; toutes: number } = $props();

	/** Deux onglets, deux titres de page : « Toutes, Pièces, Association des Tilleuls ». */
	const onglet = $derived(page.url.pathname.endsWith('/toutes') ? 'Toutes' : 'Manquantes');

	const lien = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `${href}?exercice=${encodeURIComponent(choisi)}` : href;
	};
</script>

<EnTete titre="Pièces" {onglet} aide={{ ancre: 'piece', texte: 'Qu’est-ce qu’une Pièce ?' }} />

<div class="onglets">
	<Onglets
		nom="Pièces"
		onglets={[
			{ libelle: 'Manquantes', href: lien('/pieces'), compteur: manquantes },
			{ libelle: 'Toutes', href: lien('/pieces/toutes'), compteur: toutes }
		]}
	/>
</div>

<style>
	.onglets {
		margin: var(--espace-4) 0;
	}
</style>
