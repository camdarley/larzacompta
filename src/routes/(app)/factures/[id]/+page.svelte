<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Download, FileX2 } from '@lucide/svelte';
	import { formaterDateLongue } from '#lib/domaine/dates.ts';
	import { LIBELLES_ETAT, montantLigne } from '#lib/domaine/factures/index.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import ApercuPdf from '#lib/ui/facture/ApercuPdf.svelte';
	import EditionFacture from '#lib/ui/facture/EditionFacture.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';

	let { data } = $props();

	const v = $derived(data.vue);
	const f = $derived(v.facture);
	const avoir = $derived(v.etat === 'avoir');
	const titre = $derived(
		f.numero === null
			? `Brouillon pour ${f.tiersNom}`
			: `${avoir ? 'Avoir' : 'Facture'} n° ${f.numero}`
	);
	const sousTitre = $derived(
		[
			f.dateEmission ? `Émise le ${formaterDateLongue(f.dateEmission)}` : 'Sans date',
			`pour ${f.tiersNom}`
		].join(', ')
	);
</script>

<ReserveOrdinateur />

{#if f.numero === null}
	<div class="seulement-ordinateur">
		{#key page.params.id}
			<EditionFacture
				facture={f}
				actions={data.actions}
				tiers={data.tiers}
				mentions={data.mentions}
				dateParDefaut={data.dateParDefaut}
			/>
		{/key}
	</div>
{/if}

<div class:seulement-telephone={f.numero === null}>
	<a class="retour" href="/factures">
		<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
		Toutes les Factures
	</a>

	{#if f.numero !== null}
		<EnTete {titre} contexte="Factures" {sousTitre}>
			{#snippet actions()}
				<Bouton href="/factures/{f.id}/pdf?telecharger" rechargement>
					<Download size={20} strokeWidth={1.75} aria-hidden="true" />
					Télécharger
				</Bouton>
				{#if v.etat === 'validee'}
					<span class="seulement-ordinateur">
						<Bouton variante="secondaire" href="/factures/{f.id}/avoir">
							<FileX2 size={20} strokeWidth={1.75} aria-hidden="true" />
							Créer un Avoir
						</Bouton>
					</span>
				{/if}
			{/snippet}
		</EnTete>
	{:else}
		<h1 class="t-title titre-brouillon">{titre}</h1>
		<p class="t-muted">{sousTitre}</p>
	{/if}

	<div class="consultation">
		<div class="resume">
			{#if v.etat === 'annulee' && v.avoir}
				<Bandeau ton="fige">
					Cette Facture est annulée par <a href="/factures/{v.avoir.id}"
						>l’Avoir n° {v.avoir.numero}</a
					>.
				</Bandeau>
			{:else if v.origine}
				<Bandeau ton="fige">
					Cet Avoir annule <a href="/factures/{v.origine.id}">la facture n° {v.origine.numero}</a>.
				</Bandeau>
			{/if}

			<dl class="faits">
				<div>
					<dt class="t-label">État</dt>
					<dd>{LIBELLES_ETAT[v.etat]}{v.detail ? `, ${v.detail}` : ''}</dd>
				</div>
				<div>
					<dt class="t-label">Action</dt>
					<dd>{v.action ?? 'Sans Action'}</dd>
				</div>
				{#if f.tiersAdresse}
					<div>
						<dt class="t-label">Adresse</dt>
						<dd class="adresse">{f.tiersAdresse}</dd>
					</div>
				{/if}
				{#if v.encaissement && v.encaissement.encaisse > 0}
					<div>
						<dt class="t-label">Encaissé</dt>
						<dd class="chiffre">{formaterMontant(v.encaissement.encaisse)}</dd>
					</div>
				{/if}
			</dl>

			<Tableau legende="Lignes de {titre}">
				<thead>
					<tr>
						<th scope="col">Désignation</th>
						<th scope="col" class="droite">Quantité</th>
						<th scope="col" class="droite">Prix unitaire</th>
						<th scope="col" class="droite">Montant</th>
					</tr>
				</thead>
				<tbody>
					{#each f.lignes as l, i (i)}
						<tr>
							<td class="principale">{l.designation}</td>
							<td class="montant">{l.quantite}</td>
							<td class="montant">{formaterMontant(l.prixUnitaire)}</td>
							<td class="montant">{formaterMontant(montantLigne(l))}</td>
						</tr>
					{/each}
				</tbody>
			</Tableau>

			<p class="total">
				<span class="t-label t-muted">Total</span>
				<span class="montant-lg">{formaterMontant(v.total)}</span>
			</p>
		</div>

		<section class="seulement-ordinateur colonne-apercu" aria-label="PDF de {titre}">
			<ApercuPdf src="/factures/{f.id}/pdf" titre="PDF de {titre}" />
		</section>
	</div>
</div>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-top: var(--espace-2);
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.consultation {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--espace-5);
		margin-top: var(--espace-4);
	}

	.resume {
		display: grid;
		gap: var(--espace-4);
		min-width: 0;
	}

	.faits {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--espace-3);
	}

	dt {
		color: var(--ink-muted);
	}

	.adresse {
		white-space: pre-line;
	}

	.chiffre {
		font-variant-numeric: tabular-nums lining-nums;
	}

	.total {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: var(--espace-3);
	}

	.colonne-apercu {
		position: sticky;
		top: var(--espace-4);
		min-width: 0;
	}

	.titre-brouillon {
		margin-top: var(--espace-2);
	}

	@media (max-width: 1279.98px) {
		.consultation {
			grid-template-columns: minmax(0, 1fr);
		}

		.colonne-apercu {
			position: static;
		}
	}
</style>
