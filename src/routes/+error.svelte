<script lang="ts">
	import { page } from '$app/state';
	import Carte from '#lib/ui/Carte.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	const refuse = $derived(page.status === 403);
	const introuvable = $derived(page.status === 404);
	const titre = $derived(
		refuse
			? 'Cette page ne vous est pas ouverte'
			: introuvable
				? 'Cette page n’existe pas'
				: 'Un souci de notre côté'
	);
	const texte = $derived(
		introuvable ? 'L’adresse a peut-être changé. Repartez de l’accueil.' : page.error?.message
	);
</script>

<div class="calme">
	<Carte etroite>
		<EnTete {titre} petit />
		<p class="texte">{texte}</p>
		<Bouton href="/">Retour à l’accueil</Bouton>
	</Carte>
</div>

<style>
	.calme {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: var(--espace-page-mobile);
	}

	.texte {
		margin: var(--espace-3) 0 var(--espace-5);
	}
</style>
