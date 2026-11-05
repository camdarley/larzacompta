<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { ReceiptText } from '@lucide/svelte';
	import {
		ETATS_CHEQUE_EMIS,
		LIBELLES_ETAT_EMIS,
		type EtatChequeEmis
	} from '#lib/domaine/cheques/index.ts';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant, formaterMontantSigne } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import FiltreEtat from '#lib/ui/cheque/FiltreEtat.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const v = $derived(data.vue);
	const saisir = $derived(data.peutSaisir);
	const voulu = $derived(page.url.searchParams.get('etat'));
	const filtre = $derived(
		ETATS_CHEQUE_EMIS.includes(voulu as EtatChequeEmis) ? (voulu as EtatChequeEmis) : null
	);
	const rangees = $derived(v.rangees.filter((r) => filtre === null || r.etat === filtre));
	const options = $derived([
		{ valeur: null, libelle: 'Tous', compteur: v.rangees.length },
		...ETATS_CHEQUE_EMIS.map((e) => ({
			valeur: e,
			libelle: LIBELLES_ETAT_EMIS[e],
			compteur: v.compteurs[e]
		}))
	]);

	let formule = $state(false);
	let numero = $state('');
	let beneficiaire = $state('');
	let occupe = $state(false);
	let erreur = $state<string | undefined>();
	let alerte = $state<string | null>(null);

	function ouvrir() {
		numero = '';
		beneficiaire = '';
		erreur = undefined;
		alerte = null;
		formule = true;
	}

	async function annulerFormule() {
		if (occupe) return;
		occupe = true;
		erreur = undefined;
		alerte = null;
		const r = await envoyer('/api/cheques/formules', {
			numero,
			beneficiaire: beneficiaire || null
		});
		occupe = false;
		if (r.type === 'ok') {
			formule = false;
			afficherToast('Formule annulée, gardée au registre.');
			await refreshAll();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'refus' && r.erreur.code === 'saisie_invalide') {
			erreur = message('champ_requis');
		} else if (r.type === 'refus' && r.erreur.details?.champ === 'numero') {
			erreur = messageErreur(r.erreur);
		} else if (r.type === 'refus') {
			alerte = messageErreur(r.erreur);
		} else {
			alerte = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		}
	}
</script>

<EnTete
	titre="Chèques"
	onglet="Émis"
	aide={{ ancre: 'cheque-emis', texte: 'Qu’est-ce qu’un Chèque émis ?' }}
	sousTitre="Le registre se remplit à la saisie. Pointé veut dire encaissé."
>
	{#snippet actions()}
		{#if saisir}
			<span class="seulement-ordinateur">
				<Bouton variante="secondaire" onclick={ouvrir}>Annuler une formule</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if v.manquants.length > 0}
	<section class="manquants" aria-labelledby="titre-manquants">
		<h2 id="titre-manquants" class="t-heading">Vus en banque, absents du registre</h2>
		<ul>
			{#each v.manquants as m (m.id)}
				<li>
					<div class="texte">
						<span>Chèque n° {m.numero}</span>
						<span class="t-caption t-muted">{formaterDateCourte(m.date)}, {m.libelle}</span>
					</div>
					<Pastille etat="a_regarder" />
					<span class="montant">{formaterMontantSigne(m.montant)}</span>
					{#if saisir}
						<span class="seulement-ordinateur">
							<Bouton variante="secondaire" href="/pointage/{m.compteId}?ligne={m.id}">
								Voir la ligne
							</Bouton>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if v.rangees.length === 0}
	<EtatVide
		icone={ReceiptText}
		titre="Aucun chèque au registre"
		phrase="Une Dépense payée par chèque s’inscrit ici toute seule, avec son numéro et son bénéficiaire."
	>
		{#snippet action()}
			{#if saisir}
				<Bouton
					variante="secondaire"
					conserverFocus
					href={urlAvec({ op: 'nouvelle', intention: 'depense', mode: 'cheque' })}
				>
					Saisir une Dépense par chèque
				</Bouton>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<FiltreEtat nom="Filtrer par état" {options} actif={filtre} />
	{#if rangees.length === 0}
		<p class="vide t-muted">Aucun chèque dans cet état.</p>
	{:else}
		<Tableau legende="Registre des Chèques émis">
			<thead>
				<tr>
					<th scope="col">Numéro</th>
					<th scope="col">Bénéficiaire</th>
					<th scope="col">Date</th>
					<th scope="col">Actions</th>
					<th scope="col">État</th>
					<th scope="col" class="droite">Montant</th>
				</tr>
			</thead>
			<tbody>
				{#each rangees as r (`${r.id}-${r.operationId}`)}
					<tr class:annule={r.etat === 'annule'}>
						<td class="numero">{r.numero}</td>
						<td class="principale">
							{#if r.operationId === null}
								{r.beneficiaire}
							{:else}
								<button
									type="button"
									class="lien"
									onclick={() => goto(urlAvec({ op: String(r.operationId) }), { reset: false })}
								>
									{r.beneficiaire}
								</button>
							{/if}
						</td>
						<td class="date">{r.date ? formaterDateCourte(r.date) : ''}</td>
						<td>{r.actions.join(', ')}</td>
						<td class="etat t-caption">{LIBELLES_ETAT_EMIS[r.etat]}</td>
						<td class="montant">{r.montant === null ? '' : formaterMontant(r.montant)}</td>
					</tr>
				{/each}
			</tbody>
		</Tableau>
	{/if}
{/if}

<Dialogue
	ouvert={formule}
	saisie
	titre="Annuler une formule"
	libelleAction="Annuler la formule"
	{occupe}
	confirmer={annulerFormule}
	revenir={() => (formule = false)}
>
	<p>Une formule abîmée ou perdue, sans paiement : elle reste au registre, état Annulé.</p>
	<div class="champs">
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
		<Champ
			etiquette="N° du chèque"
			id="formule-numero"
			name="numero"
			bind:valeur={numero}
			{erreur}
			autocomplete="off"
		/>
		<Champ
			etiquette="Motif ou bénéficiaire"
			id="formule-beneficiaire"
			name="beneficiaire"
			aide="Facultatif."
			bind:valeur={beneficiaire}
			autocomplete="off"
		/>
	</div>
</Dialogue>

<style>
	.numero,
	.date {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.etat {
		color: var(--ink-muted);
	}

	.annule td {
		color: var(--ink-muted);
	}

	.lien {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--primary);
		font: inherit;
		text-align: left;
		text-decoration: underline;
		cursor: pointer;
	}

	.vide {
		padding: var(--espace-5) 0;
		text-align: center;
	}

	.manquants {
		display: grid;
		gap: var(--espace-2);
	}

	.manquants ul {
		display: grid;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.manquants li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-2) var(--espace-3);
		padding: var(--espace-2) var(--espace-3);
		border-bottom: 1px solid var(--border);
	}

	.manquants li:last-child {
		border-bottom: 0;
	}

	.texte {
		display: grid;
		flex: 1 1 14rem;
		min-width: 0;
	}

	.champs {
		display: grid;
		gap: var(--espace-3);
		margin-top: var(--espace-3);
	}
</style>
