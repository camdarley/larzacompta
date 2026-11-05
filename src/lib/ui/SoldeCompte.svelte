<script lang="ts">
	import { LIBELLES_TYPE_COMPTE, type Compte } from '#lib/domaine/parametrage.ts';
	import { centimes, type Centimes } from '#lib/domaine/montant.ts';
	import CalculPose from './CalculPose.svelte';

	type Props = {
		compte: Compte;
		depart: Centimes;
		mouvements: Centimes;
		solde: Centimes;
		/** Toute la carte mène au Pointage, si le rôle y a accès. */
		href?: string | null;
	};
	let { compte, depart, mouvements, solde, href = null }: Props = $props();
</script>

<article class="solde-compte" class:lien={href}>
	<header>
		<h2 class="t-heading">
			{#if href}<a {href}>{compte.libelle}</a>{:else}{compte.libelle}{/if}
		</h2>
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

	.lien {
		position: relative;
	}

	.lien:hover {
		border-color: var(--border-strong);
	}

	.lien a {
		color: var(--ink);
		text-decoration: none;
	}

	/* Toute la carte reçoit le clic, le lien reste le seul élément focalisable. */
	.lien a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--rayon-lg);
	}
</style>
