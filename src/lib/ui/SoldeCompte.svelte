<script lang="ts">
	import { LIBELLES_TYPE_COMPTE, type Compte } from '#lib/domaine/parametrage.ts';
	import { sommeCentimes, type Centimes } from '#lib/domaine/montant.ts';
	import { centimes } from '#lib/domaine/montant.ts';
	import CalculPose from './CalculPose.svelte';

	let { compte, depart }: { compte: Compte; depart: Centimes } = $props();

	const mouvements = centimes(0);
	const total = $derived(sommeCentimes([depart, mouvements]));
</script>

<article class="solde-compte">
	<header>
		<h2 class="t-heading">{compte.libelle}</h2>
		<p class="t-caption t-muted">{LIBELLES_TYPE_COMPTE[compte.type]}</p>
	</header>
	<CalculPose
		termes={[
			{ libelle: 'Solde de départ', montant: depart },
			{ libelle: 'Mouvements', montant: mouvements, signe: '+' }
		]}
		totalLibelle="Solde calculé"
		{total}
	/>
</article>

<style>
	.solde-compte {
		display: grid;
		gap: var(--espace-3);
		height: 100%;
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}
</style>
