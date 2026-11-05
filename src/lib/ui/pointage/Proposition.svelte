<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant, formaterMontantSigne, lectureMontant } from '#lib/domaine/montant.ts';
	import type { Proposition } from '#lib/domaine/releve/proposer.ts';
	import Touche from '#lib/ui/Touche.svelte';

	type Props = {
		proposition: Proposition;
		rang: number;
		selectionnee: boolean;
		cochee: boolean;
		selectionner: () => void;
		cocher: () => void;
	};

	let { proposition: p, rang, selectionnee, cochee, selectionner, cocher }: Props = $props();

	const VISIBLES = 4;
	const visibles = $derived(p.remise?.cheques.slice(0, VISIBLES) ?? []);
	const autres = $derived(Math.max(0, (p.remise?.cheques.length ?? 0) - VISIBLES));
</script>

<li class="proposition" class:selectionnee>
	<button
		class="corps"
		type="button"
		aria-pressed={selectionnee}
		data-proposition={p.coteId}
		onclick={selectionner}
	>
		<Touche>{rang}</Touche>
		<span class="texte">
			<span class="libelle">{p.libelle}</span>
			<span class="raison t-caption">{p.raison}</span>
		</span>
		<span class="droite">
			<span class="montant" aria-label={lectureMontant(p.montant)}>
				{formaterMontantSigne(p.montant)}
			</span>
			<span class="date t-caption">{formaterDateCourte(p.date)}</span>
		</span>
	</button>
	{#if p.remise}
		<div class="remise t-caption">
			<ul aria-label="Chèques de la Remise n° {p.remise.numero}">
				{#each visibles as c (c.id)}
					<li>
						<span>{c.emetteur}</span>
						<span class="chiffre">{formaterMontant(c.montant)}</span>
					</li>
				{/each}
				{#if autres > 0}
					<li class="t-muted">et {autres} {autres > 1 ? 'autres' : 'autre'}</li>
				{/if}
			</ul>
			<a href="/cheques/remises/{p.remise.id}">Voir le bordereau n° {p.remise.numero}</a>
		</div>
	{/if}
	<label class="relier t-caption">
		<input type="checkbox" checked={cochee} onchange={cocher} />
		{#if cochee}<Check size={14} strokeWidth={2} aria-hidden="true" />{/if}
		Relier aussi
	</label>
</li>

<style>
	.proposition {
		display: grid;
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
	}

	.selectionnee {
		margin: -1px;
		border: 2px solid var(--primary);
		background: var(--primary-soft);
	}

	.corps {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--espace-3);
		padding: var(--espace-3);
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.texte,
	.droite {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.droite {
		justify-items: end;
	}

	.libelle {
		font-weight: var(--typo-body-strong-graisse);
		overflow-wrap: anywhere;
	}

	.raison,
	.date {
		color: var(--ink-muted);
	}

	.remise {
		display: grid;
		gap: var(--espace-1);
		padding: 0 var(--espace-3) var(--espace-2) calc(var(--espace-3) * 2 + var(--espace-5));
	}

	.remise li {
		display: flex;
		justify-content: space-between;
		gap: var(--espace-3);
	}

	.chiffre {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.relier {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		justify-self: end;
		padding: 0 var(--espace-3) var(--espace-2);
		color: var(--ink-muted);
		cursor: pointer;
	}

	.relier input {
		margin: 0;
		accent-color: var(--primary);
	}
</style>
