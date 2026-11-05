<script lang="ts">
	import { Check, ChevronsUpDown } from '@lucide/svelte';
	import { formaterDateLongue } from '#lib/domaine/dates.ts';
	import { centimes, formaterMontant, lectureMontant } from '#lib/domaine/montant.ts';
	import type { BarreEcartVue, ComptePointable } from '#lib/domaine/releve/vues.ts';
	import Menu from '#lib/ui/Menu.svelte';

	type Props = {
		barre: BarreEcartVue;
		compte: ComptePointable;
		comptes: ComptePointable[];
		/** Le bouton Écart ouvre le `panneau` des causes. */
		causes: () => void;
		indiquerSolde: () => void;
		peutAgir: boolean;
	};

	let { barre, compte, comptes, causes, indiquerSolde, peutAgir }: Props = $props();

	const nul = $derived(barre.ecart === 0);
	const fini = $derived(nul && barre.pointees === barre.total && barre.total > 0);
	const ecartAffiche = $derived(
		barre.ecart === null ? null : formaterMontant(centimes(Math.abs(barre.ecart)))
	);

	/** Dite une seule fois, après chaque validation : le reste de la barre ne s'annonce pas. */
	const annonce = $derived(
		[
			barre.releve === null ? 'Relevé sans solde' : `Relevé ${lectureMontant(barre.releve)}`,
			`Calculé ${lectureMontant(barre.calcule)}`,
			barre.ecart === null
				? ''
				: nul
					? 'Écart nul'
					: `Écart de ${lectureMontant(centimes(Math.abs(barre.ecart)))}`,
			`${barre.pointees} sur ${barre.total}`
		]
			.filter(Boolean)
			.join(', ')
	);
</script>

<section class="barre-ecart" class:fini aria-label="Écart du relevé">
	<div class="compte">
		<h1 class="t-title" tabindex="-1">Pointage</h1>
		{#if comptes.length > 1}
			<Menu nom="{compte.libelle}, changer de Compte" classe="choix-compte">
				{#snippet bouton()}
					<span class="t-heading">{compte.libelle}</span>
					<ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
				{/snippet}
				{#each comptes as c (c.id)}
					<a href="/pointage/{c.id}" aria-current={c.id === compte.id ? 'true' : undefined}>
						<span class="option">{c.libelle}</span>
						{#if c.id === compte.id}<Check size={16} strokeWidth={2} aria-hidden="true" />{/if}
					</a>
				{/each}
			</Menu>
		{:else}
			<p class="t-heading">{compte.libelle}</p>
		{/if}
	</div>

	<dl class="valeurs">
		<div>
			<dt class="t-label">Relevé</dt>
			<dd class="montant-lg">
				{#if barre.releve !== null}
					{formaterMontant(barre.releve)}
				{:else if peutAgir}
					<button class="lien" type="button" onclick={indiquerSolde}>Indiquer le solde</button>
				{:else}
					<span class="t-muted">Non connu</span>
				{/if}
			</dd>
			{#if barre.dateReleve}
				<dd class="date t-caption t-muted">au {formaterDateLongue(barre.dateReleve)}</dd>
			{/if}
		</div>
		<div>
			<dt class="t-label">Calculé</dt>
			<dd class="montant-lg">{formaterMontant(barre.calcule)}</dd>
		</div>
		<div class="ecart" class:nul>
			<dt class="t-label">Écart</dt>
			<dd class="montant-lg">
				{#if ecartAffiche === null}
					<span class="t-muted" aria-label="Non calculé">—</span>
				{:else}
					<button
						class="cible-etendue"
						type="button"
						aria-label="Écart de {ecartAffiche}, voir les causes"
						onclick={causes}
					>
						{#if nul}<Check size={22} strokeWidth={2.25} aria-hidden="true" />{/if}
						{ecartAffiche}
					</button>
				{/if}
			</dd>
		</div>
	</dl>

	{#if barre.total > 0}
		<p class="progression t-label">
			<span class="compte-rendu">{barre.pointees} sur {barre.total}</span>
			<progress max={Math.max(barre.total, 1)} value={barre.pointees} aria-hidden="true"></progress>
		</p>
	{/if}

	<p class="visuellement-cache" aria-live="polite" aria-atomic="true">{annonce}</p>
</section>

<style>
	.barre-ecart {
		position: sticky;
		z-index: 20;
		top: var(--espace-2);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-3) var(--espace-5);
		padding: var(--espace-3) var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.barre-ecart.fini {
		border-color: var(--success);
		background: var(--success-soft);
	}

	.compte {
		display: grid;
		justify-items: start;
		gap: 2px;
		flex: none;
	}

	.compte p,
	.compte :global(.choix-compte .t-heading) {
		white-space: nowrap;
	}

	.compte :global(.choix-compte) {
		min-height: 32px;
		padding: 2px var(--espace-1);
		margin-left: calc(-1 * var(--espace-1));
		color: var(--ink);
	}

	.compte :global(.choix-compte:hover) {
		background: var(--surface-sunken);
	}

	.option {
		flex: 1;
	}

	.valeurs {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: var(--espace-2) var(--espace-6);
		margin: 0;
	}

	.valeurs > div {
		display: grid;
		align-content: start;
	}

	dt {
		color: var(--ink-muted);
	}

	dd {
		margin: 0;
		text-align: left;
	}

	.ecart button {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		padding: 0;
		border: 0;
		border-bottom: 1px dotted var(--ink-muted);
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-variant-numeric: inherit;
		cursor: pointer;
	}

	.ecart.nul button {
		color: var(--success);
		border-bottom-color: var(--success);
	}

	.ecart.nul dt {
		color: var(--success);
	}

	.lien {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--primary);
		font: inherit;
		font-size: var(--typo-body-taille);
		font-weight: var(--typo-label-graisse);
		text-decoration: underline;
		cursor: pointer;
	}

	.progression {
		display: grid;
		justify-items: end;
		gap: var(--espace-1);
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	progress {
		width: 96px;
		height: 6px;
		border: 0;
		border-radius: var(--rayon-full);
		overflow: hidden;
		background: var(--surface-sunken);
		appearance: none;
	}

	progress::-webkit-progress-bar {
		background: var(--surface-sunken);
	}

	progress::-webkit-progress-value {
		background: var(--primary);
	}

	progress::-moz-progress-bar {
		background: var(--primary);
	}

	.fini progress::-webkit-progress-value {
		background: var(--success);
	}

	.fini progress::-moz-progress-bar {
		background: var(--success);
	}

	/* La cible de 48 px déborde en transparence : la valeur reste alignée sur ses voisines. */
	@media (max-width: 639.98px), (pointer: coarse) {
		.ecart button {
			position: relative;
		}

		.ecart button::after {
			content: '';
			position: absolute;
			inset: -14px -8px;
		}
	}

	/* Rail d'icônes ou téléphone : le Compte prend sa rangée, les trois valeurs restent ensemble. */
	@media (max-width: 1023.98px) {
		.compte {
			display: flex;
			flex: 1 1 100%;
			align-items: baseline;
			gap: var(--espace-3);
		}
	}

	@media (max-width: 639.98px) {
		.compte {
			flex: 1 1 auto;
			flex-wrap: wrap;
			gap: 2px var(--espace-3);
		}

		.barre-ecart {
			top: 0;
			padding: var(--espace-3);
		}

		.valeurs {
			display: grid;
			flex: 1 1 100%;
			grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
			order: 3;
			gap: var(--espace-2) var(--espace-3);
		}

		.valeurs :global(.montant-lg) {
			font-size: var(--typo-heading-taille);
		}
	}
</style>
