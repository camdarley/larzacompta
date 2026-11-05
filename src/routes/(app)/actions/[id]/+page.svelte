<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Shapes } from '@lucide/svelte';
	import { noeudNature } from '#lib/domaine/etats/arbre.ts';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { centimes, formaterMontant } from '#lib/domaine/montant.ts';
	import BudgetAction from '#lib/ui/budget/BudgetAction.svelte';
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

{#if data.budget}<BudgetAction bloc={data.budget} />{/if}

{#if data.sessions.length > 0}
	<section class="sessions" aria-labelledby="titre-sessions">
		<h2 id="titre-sessions" class="t-heading">Sessions de caisse</h2>
		<ul>
			{#each data.sessions as s (s.id)}
				<li>
					<div>
						{#if data.peutConsulterCaisses}<a href="/sessions/{s.id}">{s.caisse}</a
							>{:else}{s.caisse}{/if}
						<p class="t-caption t-muted">
							{s.date ? formaterDateCourte(s.date) : ''}{s.ouverte ? ', ouverte' : ', clôturée'}
						</p>
					</div>
					<p class="montant">{s.recette === null ? '—' : formaterMontant(s.recette)}</p>
				</li>
			{/each}
		</ul>
	</section>
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

	.sessions {
		margin-top: var(--espace-5);
	}

	.sessions ul {
		margin-top: var(--espace-2);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.sessions li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		min-height: var(--espace-row-double);
		padding: var(--espace-2) var(--espace-3);
	}

	.sessions li + li {
		border-top: 1px solid var(--border);
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
