<script lang="ts">
	import { formaterDateLongue } from '#lib/domaine/dates.ts';
	import { LIBELLES_MODE_PAIEMENT, type OperationJ } from '#lib/domaine/journal.ts';
	import { formaterMontant, formaterMontantSigne, centimes } from '#lib/domaine/montant.ts';
	import { montantOperation } from '#lib/domaine/operations/lecture.ts';
	import { colonneDe } from '#lib/domaine/etats/soldes.ts';
	import Pastille from '#lib/ui/Pastille.svelte';

	type Noms = readonly { id: number; libelle: string }[];
	type Props = {
		operation: OperationJ;
		comptes: Noms;
		natures: Noms;
		actions: Noms;
		exercices: Noms;
		exerciceCourantId: number | null;
	};

	let { operation: op, comptes, natures, actions, exercices, exerciceCourantId }: Props = $props();

	const nom = (liste: Noms, id: number | null) => liste.find((x) => x.id === id)?.libelle ?? '';
	const montant = $derived(montantOperation(op));
</script>

<dl class="fiche">
	<div>
		<dt class="t-label t-muted">Montant</dt>
		<dd class="montant-lg">
			{op.genre === 'interne' ? formaterMontant(montant) : formaterMontantSigne(montant)}
		</dd>
	</div>
	<div>
		<dt class="t-label t-muted">Date</dt>
		<dd>{formaterDateLongue(op.date)}</dd>
	</div>
	{#each op.cotes as c (c.id)}
		<div>
			<dt class="t-label t-muted">
				{op.genre === 'interne' ? (c.montant < 0 ? 'Parti de' : 'Arrivé sur') : 'Compte'}
			</dt>
			<dd>
				{nom(comptes, c.compteId)}{#if op.genre === 'interne'}, le {formaterDateLongue(c.date)}{/if}
			</dd>
		</div>
	{/each}
	{#if op.modePaiement}
		<div>
			<dt class="t-label t-muted">Paiement</dt>
			<dd>{LIBELLES_MODE_PAIEMENT[op.modePaiement]}</dd>
		</div>
	{/if}
	{#if op.reference}
		<div>
			<dt class="t-label t-muted">Référence</dt>
			<dd>{op.reference}</dd>
		</div>
	{/if}
	{#if op.tiers}
		<div>
			<dt class="t-label t-muted">Tiers</dt>
			<dd>{op.tiers}</dd>
		</div>
	{/if}
	{#if op.note}
		<div>
			<dt class="t-label t-muted">Note</dt>
			<dd>{op.note}</dd>
		</div>
	{/if}
</dl>

{#if op.lignes.length > 0}
	<section>
		<h3 class="t-heading">Répartition</h3>
		<ul class="lignes">
			{#each op.lignes as l (l.id)}
				<li>
					<div>
						<p>{nom(natures, l.natureId)}</p>
						<p class="t-caption t-muted">
							{nom(actions, l.actionId) ||
								'Sans Action'}{#if colonneDe(l) === 'depense' && l.montant > 0}, réduit la dépense{/if}
						</p>
						{#if l.exerciceRattachementId !== exerciceCourantId}
							<Pastille etat="rattachee" texte="Sur {nom(exercices, l.exerciceRattachementId)}" />
						{/if}
						{#if l.note}<p class="t-caption t-muted">{l.note}</p>{/if}
					</div>
					<span class="montant">{formaterMontant(centimes(l.montant))}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.fiche {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--espace-3) var(--espace-5);
	}

	.fiche .montant-lg {
		text-align: left;
	}

	section {
		margin-top: var(--espace-5);
	}

	.lignes {
		margin-top: var(--espace-2);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
	}

	.lignes li {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--espace-3);
		padding: var(--espace-2) var(--espace-3);
	}

	.lignes li + li {
		border-top: 1px solid var(--border);
	}

	@media (max-width: 639.98px) {
		.fiche {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
