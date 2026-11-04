<script lang="ts">
	import { BookOpenCheck, Sprout } from '@lucide/svelte';
	import { peut } from '#lib/domaine/droits.ts';
	import { TEXTES } from '#lib/messages.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import SoldeCompte from '#lib/ui/SoldeCompte.svelte';

	let { data } = $props();
</script>

<EnTete titre="Tableau de contrôle" sansTitre />

{#if !data.pret}
	<EtatVide
		principal
		icone={Sprout}
		titre="Bienvenue"
		phrase="Commençons par vos Comptes et leurs soldes de départ."
	>
		{#snippet action()}
			{#if peut(data.acces.role, 'parametrer')}
				<Bouton href="/bienvenue">Lancer l’assistant</Bouton>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<header class="bilan">
		<BookOpenCheck size={32} strokeWidth={1.75} aria-hidden="true" />
		<div>
			<h1 class="t-display" tabindex="-1">{TEXTES.cahier_pret}</h1>
			<p class="t-muted">Soldes de départ de {data.exercice?.libelle}.</p>
		</div>
	</header>

	<ul class="soldes">
		{#each data.soldes as s (s.compte.id)}
			<li><SoldeCompte compte={s.compte} depart={s.solde} /></li>
		{/each}
	</ul>
{/if}

<style>
	.bilan {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-3);
		margin-bottom: var(--espace-6);
		color: var(--primary);
	}

	.bilan h1 {
		color: var(--ink);
	}

	.bilan :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.soldes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--espace-4);
	}
</style>
