<script lang="ts">
	import { page } from '$app/state';
	import { noeudAnterieur, noeudGroupe } from '#lib/domaine/etats/arbre.ts';
	import { formaterMontantSigne } from '#lib/domaine/montant.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Exporter from '#lib/ui/etats/Exporter.svelte';
	import TableauDepliable from '#lib/ui/etats/TableauDepliable.svelte';

	let { data } = $props();

	const r = $derived(data.etat?.resultat ?? null);
	/** Un Groupe sans mouvement n'apprend rien : il repousserait le résultat loin sous la barre. */
	const groupesUtiles = $derived(
		r?.groupes.filter((g) => g.recettes !== 0 || g.depenses !== 0) ?? []
	);
	const noeuds = $derived(groupesUtiles.map(noeudGroupe));
	const anterieurs = $derived(r?.anterieurs.groupes.map(noeudAnterieur) ?? []);
	const nomExercice = (id: number) => data.reperes.find((e) => e.id === id)?.libelle ?? '';
	const avecExercice = (href: string) => {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `${href}?exercice=${encodeURIComponent(choisi)}` : href;
	};
</script>

<EnTete
	titre="Compte de résultat"
	contexte="États"
	sousTitre="Ce que l’Exercice a rapporté et coûté, par Groupe."
>
	{#snippet actions()}
		{#if r}<Exporter etat="compte-de-resultat" />{/if}
	{/snippet}
</EnTete>

<p class="aide t-muted">
	Il ne compte ni les <AideTerme ancre="mouvement-interne">Mouvements internes</AideTerme>, ni les
	sommes neutres. Ce que le résultat ne dit pas s’explique dans l’<a
		href={avecExercice('/etats/tresorerie')}>État de trésorerie</a
	>.
</p>

{#each data.etat?.anomalies ?? [] as a (a)}
	<Bandeau ton="erreur" alerte>{a}</Bandeau>
{/each}

{#if r}
	<div>
		{#if noeuds.length === 0}
			<p class="t-muted">Aucune recette ni dépense sur cet Exercice.</p>
		{/if}
		<TableauDepliable
			{noeuds}
			legende="Compte de résultat de {data.exercice?.libelle}"
			exerciceId={data.exercice?.id ?? null}
			{nomExercice}
			reduit
		/>
		<div class="pied">
			<p class="t-label">Résultat de l’Exercice</p>
			<p class="montant-lg">{formaterMontantSigne(r.resultat)}</p>
		</div>
	</div>

	{#if anterieurs.length > 0}
		<section id="anterieurs" class="anterieurs" aria-labelledby="titre-anterieurs">
			<h2 id="titre-anterieurs" class="t-heading">Sur Exercices antérieurs</h2>
			<p class="t-muted">
				Ces sommes ont bougé la trésorerie cette année, sans compter dans son résultat.
			</p>
			<TableauDepliable
				noeuds={anterieurs}
				legende="Sur Exercices antérieurs"
				exerciceId={data.exercice?.id ?? null}
				{nomExercice}
				reduit
			/>
			<div class="pied">
				<p class="t-label">Total hors résultat</p>
				<p class="montant-lg">{formaterMontantSigne(r.anterieurs.resultat)}</p>
			</div>
		</section>
	{/if}
{/if}

<style>
	.aide {
		max-width: var(--espace-reading-max);
	}

	.pied {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--espace-3);
		margin-top: var(--espace-3);
		padding: var(--espace-3);
		border-top: 1px solid var(--ink);
	}

	.anterieurs {
		display: grid;
		gap: var(--espace-2);
	}
</style>
