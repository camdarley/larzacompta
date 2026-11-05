<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Shapes } from '@lucide/svelte';
	import { noeudNature } from '#lib/domaine/etats/arbre.ts';
	import { centimes } from '#lib/domaine/montant.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Exporter from '#lib/ui/etats/Exporter.svelte';
	import TableauDepliable from '#lib/ui/etats/TableauDepliable.svelte';

	let { data } = $props();

	const action = $derived(data.fiche?.action ?? null);
	const retour = $derived.by(() => {
		const choisi = page.url.searchParams.get('exercice');
		return choisi ? `/actions?exercice=${encodeURIComponent(choisi)}` : '/actions';
	});
	const noeuds = $derived(action?.natures.map((n) => noeudNature(n, `a${action.actionId}`)) ?? []);
</script>

<a class="retour" href={retour}>
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Toutes les Actions
</a>

<EnTete
	titre={data.fiche?.libelle ?? 'Action'}
	contexte="Actions"
	sousTitre={data.fiche ? `Groupe ${data.fiche.groupe}, Exercice ${data.exercice?.libelle}.` : ''}
>
	{#snippet actions()}
		{#if action}<Exporter etat="action" actionId={data.id} />{/if}
	{/snippet}
</EnTete>

{#each data.fiche?.anomalies ?? [] as a (a)}
	<div class="anomalie"><Bandeau ton="erreur" alerte>{a}</Bandeau></div>
{/each}

{#if action === null}
	<EtatVide
		icone={Shapes}
		titre="Rien sur cet Exercice"
		phrase="Cette Action n’a aucune Ligne dans {data.exercice?.libelle}."
	/>
{:else}
	<div class="resume">
		<CalculPose
			termes={[
				{ libelle: 'Recettes', montant: action.recettes },
				{ libelle: 'Dépenses', montant: centimes(action.depenses), signe: '−' }
			]}
			totalLibelle="Résultat"
			total={action.resultat}
		/>
	</div>
	<TableauDepliable
		{noeuds}
		legende="Détail de {action.libelle}"
		exerciceId={data.exercice?.id ?? null}
	/>
{/if}

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		min-height: var(--espace-row);
		margin-bottom: var(--espace-1);
	}

	.anomalie {
		margin-bottom: var(--espace-4);
	}

	.resume {
		max-width: 340px;
		margin-top: var(--espace-5);
		margin-bottom: var(--espace-5);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}
</style>
