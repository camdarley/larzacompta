<script lang="ts">
	import { page } from '$app/state';
	import { Landmark } from '@lucide/svelte';
	import { LIBELLES_ETAT_REMISE, type EtatRemise } from '#lib/domaine/cheques/index.ts';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import FiltreEtat from '#lib/ui/cheque/FiltreEtat.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';

	let { data } = $props();

	const v = $derived(data.vue);
	const saisir = $derived(data.peutSaisir);
	const voulu = $derived(page.url.searchParams.get('etat'));
	const filtre = $derived(voulu && voulu in LIBELLES_ETAT_REMISE ? (voulu as EtatRemise) : null);
	const rangees = $derived(v.rangees.filter((r) => filtre === null || r.etat === filtre));
	const options = $derived([
		{ valeur: null, libelle: 'Toutes', compteur: v.rangees.length },
		...(['remise', 'pointee', 'annulee'] as const).map((e) => ({
			valeur: e,
			libelle: LIBELLES_ETAT_REMISE[e],
			compteur: v.compteurs[e]
		}))
	]);
</script>

<EnTete
	titre="Chèques"
	onglet="Remises"
	aide={{ ancre: 'remise', texte: 'Qu’est-ce qu’une Remise ?' }}
	sousTitre="Chaque paquet déposé à la banque, avec son bordereau."
>
	{#snippet actions()}
		{#if saisir && v.enAttente > 0}
			<span class="seulement-ordinateur">
				<Bouton href="/cheques/remises/nouvelle">Nouvelle Remise</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if v.rangees.length === 0}
	<EtatVide
		icone={Landmark}
		titre="Aucune Remise pour l’instant"
		phrase="Quand une pile de chèques est prête, constituez la Remise : le bordereau se prépare seul."
	>
		{#snippet action()}
			{#if saisir && v.enAttente > 0}
				<span class="seulement-ordinateur">
					<Bouton href="/cheques/remises/nouvelle">Nouvelle Remise</Bouton>
				</span>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<FiltreEtat nom="Filtrer par état" {options} actif={filtre} />
	{#if rangees.length === 0}
		<p class="vide t-muted">Aucune Remise dans cet état.</p>
	{:else}
		<Tableau legende="Remises">
			<thead>
				<tr>
					<th scope="col">N°</th>
					<th scope="col">Remise</th>
					<th scope="col">Date</th>
					<th scope="col">Compte</th>
					<th scope="col">État</th>
					<th scope="col" class="droite">Total</th>
				</tr>
			</thead>
			<tbody>
				{#each rangees as r (r.id)}
					<tr>
						<td class="numero">{r.numero}</td>
						<td class="principale">
							<a href="/cheques/remises/{r.id}">
								{r.etat === 'annulee'
									? `Remise n° ${r.numero}`
									: `${r.nombre} ${r.nombre > 1 ? 'chèques' : 'chèque'}`}
							</a>
						</td>
						<td class="date">{formaterDateCourte(r.date)}</td>
						<td>{r.compte}</td>
						<td class="etat t-caption">{LIBELLES_ETAT_REMISE[r.etat]}</td>
						<td class="montant">{formaterMontant(r.total)}</td>
					</tr>
				{/each}
			</tbody>
		</Tableau>
	{/if}
{/if}

{#if saisir}<ReserveOrdinateur />{/if}

<style>
	.numero,
	.date {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.etat {
		color: var(--ink-muted);
	}

	.vide {
		padding: var(--espace-5) 0;
		text-align: center;
	}
</style>
