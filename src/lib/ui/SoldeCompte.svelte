<script lang="ts">
	import { LIBELLES_TYPE_COMPTE, type Compte } from '#lib/domaine/parametrage.ts';
	import { centimes, type Centimes } from '#lib/domaine/montant.ts';
	import CalculPose from './CalculPose.svelte';

	type Props = { compte: Compte; depart: Centimes; mouvements: Centimes; solde: Centimes };
	let { compte, depart, mouvements, solde }: Props = $props();
</script>

<article class="solde-compte">
	<header>
		<h2 class="t-heading">{compte.libelle}</h2>
		<p class="t-caption t-muted">{LIBELLES_TYPE_COMPTE[compte.type]}</p>
	</header>
	<CalculPose
		termes={[
			{ libelle: 'Solde de départ', montant: depart },
			{
				libelle: 'Mouvements',
				montant: centimes(Math.abs(mouvements)),
				signe: mouvements < 0 ? '−' : '+'
			}
		]}
		totalLibelle="Solde calculé"
		total={solde}
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
