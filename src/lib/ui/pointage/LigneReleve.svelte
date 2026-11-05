<script lang="ts">
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontantSigne, lectureMontant } from '#lib/domaine/montant.ts';
	import type { LigneFile } from '#lib/domaine/releve/vues.ts';
	import Pastille from '#lib/ui/Pastille.svelte';

	type Props = {
		ligne: LigneFile;
		/** Porte le `tabindex` de la file. */
		active: boolean;
		/** Ligne en cours de traitement, surlignée. */
		surlignee: boolean;
		cochee: boolean;
		peutAgir: boolean;
		activer: () => void;
		cocher: () => void;
	};

	let { ligne, active, surlignee, cochee, peutAgir, activer, cocher }: Props = $props();
	const pointee = $derived(ligne.etat === 'pointe');
	const pastille = $derived(
		ligne.etat === 'pointe' ? 'pointe' : ligne.etat === 'a_regarder' ? 'a_regarder' : 'a_pointer'
	);
</script>

<li class="rangee" class:active={surlignee} class:pointee>
	{#if peutAgir && ligne.etat === 'a_pointer'}
		<label class="coche seulement-ordinateur">
			<input
				type="checkbox"
				tabindex="-1"
				checked={cochee}
				aria-label="Relier aussi {ligne.libelle}"
				onchange={cocher}
			/>
		</label>
	{/if}
	<button
		class="ligne-releve"
		type="button"
		data-ligne={ligne.id}
		tabindex={active ? 0 : -1}
		aria-current={active ? 'true' : undefined}
		onclick={activer}
	>
		<span class="haut">
			<span class="libelle">{ligne.libelle}</span>
			<span class="montant" aria-label={lectureMontant(ligne.montant)}>
				{formaterMontantSigne(ligne.montant)}
			</span>
		</span>
		<span class="bas">
			<span class="date t-caption">{formaterDateCourte(ligne.date)}</span>
			<Pastille etat={pastille} />
		</span>
	</button>
</li>

<style>
	.rangee {
		position: relative;
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--border);
		/* Le focus ne se cache jamais sous la barre collante. */
		scroll-margin-block: var(--espace-2);
	}

	.rangee.active {
		background: var(--surface-highlight);
		box-shadow: inset 3px 0 0 var(--primary);
	}

	.coche {
		display: flex;
		align-items: center;
		flex: none;
		padding-left: var(--espace-3);
		cursor: pointer;
	}

	.coche input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--primary);
		cursor: pointer;
	}

	.ligne-releve {
		display: grid;
		flex: 1;
		align-content: center;
		gap: 2px;
		min-width: 0;
		min-height: var(--espace-row-double);
		padding: var(--espace-2) var(--espace-3);
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.ligne-releve:hover {
		background: var(--surface-sunken);
	}

	.active .ligne-releve:hover {
		background: transparent;
	}

	.ligne-releve:focus-visible {
		outline-offset: -2px;
	}

	.haut,
	.bas {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--espace-3);
		min-width: 0;
	}

	.bas {
		align-items: center;
	}

	.libelle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date {
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.pointee .ligne-releve {
		color: var(--ink-muted);
	}
</style>
