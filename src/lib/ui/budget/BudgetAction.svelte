<script lang="ts">
	import { formaterPourcentage, type BlocBudget } from '#lib/domaine/budget/index.ts';
	import {
		formaterMontant,
		formaterMontantSigne,
		lectureMontant,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import Pastille from '#lib/ui/Pastille.svelte';
	import BarreRealise from './BarreRealise.svelte';

	let { bloc }: { bloc: BlocBudget } = $props();

	const SENS = { recette: 'Recette', depense: 'Dépense' } as const;
</script>

{#snippet montant(c: Centimes | null, texte: string)}
	{#if c !== null}
		<span class="visuellement-cache">{lectureMontant(c)}</span>
		<span aria-hidden="true">{texte}</span>
	{/if}
{/snippet}

<section class="budget" aria-labelledby="titre-budget">
	<h2 id="titre-budget" class="t-heading">Budget</h2>
	<ul>
		{#each bloc.rangees as r (r.cle)}
			<li>
				<div class="nom">
					<span>{r.libelle}</span>
					<span class="t-caption t-muted">{SENS[r.sens]}</span>
					{#if r.depassement}<Pastille etat="a_regarder" />{/if}
				</div>
				<dl>
					<div>
						<dt class="t-caption t-muted">Prévu</dt>
						<dd class="montant">
							{@render montant(r.prevu, r.prevu === null ? '' : formaterMontant(r.prevu))}
						</dd>
					</div>
					<div>
						<dt class="t-caption t-muted">Réalisé</dt>
						<dd class="montant">
							{#if r.prevu !== null}<BarreRealise part={r.part} depassement={r.depassement} />{/if}
							{@render montant(r.realise, formaterMontant(r.realise))}
						</dd>
					</div>
					<div>
						<dt class="t-caption t-muted">Différence</dt>
						<dd class="montant">
							{@render montant(r.difference, formaterMontantSigne(r.difference))}
							{#if r.pourcentage !== null}
								<span class="t-caption t-muted">{formaterPourcentage(r.pourcentage)}</span>
							{/if}
						</dd>
					</div>
				</dl>
			</li>
		{/each}
	</ul>
</section>

<style>
	.budget {
		margin-top: var(--espace-5);
	}

	ul {
		margin-top: var(--espace-2);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--espace-2) var(--espace-4);
		padding: var(--espace-2) var(--espace-3);
	}

	li + li {
		border-top: 1px solid var(--border);
	}

	.nom {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--espace-2);
		min-width: 0;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(3, 150px);
		gap: var(--espace-3);
		margin: 0;
	}

	dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0 var(--espace-2);
		margin: 0;
		white-space: nowrap;
	}

	dt {
		text-align: right;
	}

	@media (max-width: 767.98px) {
		li {
			grid-template-columns: minmax(0, 1fr);
		}

		dl {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: var(--espace-2);
		}

		dt {
			text-align: left;
		}

		dd {
			justify-content: flex-start;
			white-space: normal;
			font-size: var(--typo-caption-taille);
		}
	}
</style>
