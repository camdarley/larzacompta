<script lang="ts">
	import { FileText, Plus } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { LIBELLES_ETAT } from '#lib/domaine/factures/index.ts';
	import { formaterMontantSigne, formaterMontant, lectureMontant } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';

	let { data } = $props();
</script>

<EnTete
	titre="Factures"
	sousTitre="Ce que l’APE facture à un tiers, numéroté sans trou."
	aide={{ ancre: 'facture-emise', texte: 'Qu’est-ce qu’une Facture émise ?' }}
>
	{#snippet actions()}
		{#if data.existe}
			<span class="seulement-ordinateur">
				<Bouton href="/factures/nouvelle">
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Nouvelle facture
				</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

<div class="corps">
	<ReserveOrdinateur />

	{#if !data.existe}
		<EtatVide
			icone={FileText}
			titre="Aucune Facture émise"
			phrase="Produisez une facture pour un tiers, par exemple la cantine."
		>
			{#snippet action()}
				<span class="seulement-ordinateur">
					<Bouton href="/factures/nouvelle">Nouvelle facture</Bouton>
				</span>
			{/snippet}
		</EtatVide>
	{:else if data.factures.length === 0}
		<p class="t-muted">Aucune Facture sur {data.exercice?.libelle}.</p>
	{:else}
		<Tableau legende="Factures et Avoirs">
			<thead>
				<tr>
					<th scope="col">Numéro</th>
					<th scope="col">Tiers</th>
					<th scope="col">Date</th>
					<th scope="col">État</th>
					<th scope="col" class="droite">Montant</th>
				</tr>
			</thead>
			<tbody>
				{#each data.factures as f (f.id)}
					<tr>
						<td class="principale">
							<a href="/factures/{f.id}">
								{#if f.numero}{f.numero}{:else}Sans numéro<span class="visuellement-cache"
										>, brouillon pour {f.tiers}</span
									>{/if}
							</a>
						</td>
						<td>{f.tiers}</td>
						<td class="chiffre">{f.date ? formaterDateCourte(f.date) : ''}</td>
						<td>
							{#if f.etat === 'brouillon'}
								<Pastille etat="brouillon" />
							{:else}
								<span class="t-caption etat">
									{LIBELLES_ETAT[f.etat]}{#if f.detail}<span class="suite">, {f.detail}</span>{/if}
								</span>
							{/if}
						</td>
						<td class="montant" aria-label={lectureMontant(f.montant)}>
							{f.montant < 0 ? formaterMontantSigne(f.montant) : formaterMontant(f.montant)}
						</td>
					</tr>
				{/each}
			</tbody>
		</Tableau>
	{/if}
</div>

<style>
	.corps {
		display: grid;
		gap: var(--espace-4);
		margin-top: var(--espace-4);
	}

	.chiffre {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.etat {
		color: var(--ink-muted);
	}
</style>
