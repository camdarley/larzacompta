<script lang="ts">
	import { page } from '$app/state';
	import { Shapes } from '@lucide/svelte';
	import { noeudAnterieur, noeudGroupe, noeudSansAction } from '#lib/domaine/etats/arbre.ts';
	import { formaterMontantSigne } from '#lib/domaine/montant.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Exporter from '#lib/ui/etats/Exporter.svelte';
	import TableauDepliable from '#lib/ui/etats/TableauDepliable.svelte';

	let { data } = $props();

	const r = $derived(data.etat?.resultat ?? null);
	const avecExercice = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `${href}?exercice=${encodeURIComponent(choisi)}` : href;
	};
	const noeuds = $derived(
		r === null
			? []
			: [
					...r.groupes.map(noeudGroupe),
					...(r.sansAction.length > 0 ? [noeudSansAction(r.sansAction, r.sansActionTotaux)] : [])
				]
	);
	const anterieurs = $derived(r?.anterieurs.groupes.map(noeudAnterieur) ?? []);
	const nomExercice = (id: number) => data.reperes.find((e) => e.id === id)?.libelle ?? '';
	const peutCreer = $derived(data.peutSaisir);
</script>

<EnTete
	titre="Actions"
	sousTitre="Ce que chaque activité a rapporté, de son total jusqu’à la Pièce."
	aide={{ ancre: 'action', texte: 'Qu’est-ce qu’une Action ?' }}
>
	{#snippet actions()}
		{#if data.etat && !data.etat.aucuneAction}<Exporter etat="actions" />{/if}
	{/snippet}
</EnTete>

<div class="page">
	{#each data.etat?.anomalies ?? [] as a (a)}
		<Bandeau ton="erreur" alerte>{a}</Bandeau>
	{/each}

	{#if data.etat === null || data.etat.aucuneAction}
		<EtatVide
			icone={Shapes}
			titre="Pas encore d’Action"
			phrase="Une Action, c’est une activité dont vous voulez connaître le résultat : Kermesse, Sortie, Agrumes…"
		>
			{#snippet action()}
				{#if peutCreer}<Bouton href="/reglages/actions?action=nouvelle">Créer une Action</Bouton
					>{/if}
			{/snippet}
		</EtatVide>
	{:else if r !== null}
		{#if noeuds.length === 0}
			<EtatVide
				icone={Shapes}
				titre="Rien sur cet Exercice"
				phrase="Les Actions se rempliront avec les Opérations de {data.exercice?.libelle}."
			/>
		{:else}
			<TableauDepliable
				{noeuds}
				legende="Résultat par Action de {data.exercice?.libelle}"
				exerciceId={data.exercice?.id ?? null}
				{nomExercice}
				hrefAction={(id) => avecExercice(`/actions/${id}`)}
			/>
		{/if}

		<div class="pied">
			<p class="t-label">Résultat de l’Exercice</p>
			<p class="montant-lg">{formaterMontantSigne(r.resultat)}</p>
			<a class="lien-cible" href={avecExercice('/etats')}>Voir le Compte de résultat</a>
		</div>

		{#if anterieurs.length > 0}
			<section class="anterieurs" aria-labelledby="titre-anterieurs">
				<h2 id="titre-anterieurs" class="t-heading">Sur Exercices antérieurs</h2>
				<p class="t-muted">
					Ces sommes ont bougé la trésorerie cette année, sans compter dans son résultat.
				</p>
				<TableauDepliable
					noeuds={anterieurs}
					legende="Sur Exercices antérieurs"
					exerciceId={data.exercice?.id ?? null}
					{nomExercice}
				/>
			</section>
		{/if}
	{/if}
</div>

<style>
	.page {
		margin-top: var(--espace-5);
	}

	.page > :global(.bandeau) {
		margin-bottom: var(--espace-4);
	}

	.pied {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--espace-1) var(--espace-3);
		margin-top: var(--espace-3);
		padding: var(--espace-3);
		border-top: 1px solid var(--ink);
	}

	.pied a {
		grid-column: 1 / -1;
	}

	.anterieurs {
		display: grid;
		gap: var(--espace-2);
		margin-top: var(--espace-6);
	}
</style>
