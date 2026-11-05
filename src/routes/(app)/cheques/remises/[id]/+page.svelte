<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { ArrowLeft, Download } from '@lucide/svelte';
	import {
		accordCheques,
		LIBELLES_ETAT_RECU,
		LIBELLES_ETAT_REMISE
	} from '#lib/domaine/cheques/index.ts';
	import { formaterDateCourte, formaterDateLongue } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const r = $derived(data.remise);
	const saisir = $derived(data.peutSaisir);
	const avecNumero = $derived(r.cheques.some((c) => c.numero !== null));
	let confirmer = $state(false);
	let occupe = $state(false);
	let alerte = $state<string | null>(null);

	async function annuler() {
		if (occupe) return;
		occupe = true;
		const reponse = await envoyer(`/api/cheques/remises/${r.id}/annuler`);
		occupe = false;
		confirmer = false;
		if (reponse.type === 'ok') {
			afficherToast('Remise annulée. Ses chèques attendent de nouveau.');
			await refreshAll();
			await goto('/cheques');
		} else if (reponse.type === 'session') {
			demanderReconnexion();
		} else if (reponse.type === 'refus') {
			alerte = messageErreur(reponse.erreur);
		} else {
			alerte = message(reponse.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		}
	}
</script>

<a class="retour" href="/cheques/remises">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Toutes les Remises
</a>

<EnTete
	titre="Remise n° {r.numero}"
	contexte="Chèques"
	sousTitre="{LIBELLES_ETAT_REMISE[r.etat]}, le {formaterDateLongue(r.date)}, sur {r.compte}."
>
	{#snippet actions()}
		{#if r.etat !== 'annulee'}
			<Bouton href="/cheques/remises/{r.id}/bordereau" rechargement>
				<Download size={20} strokeWidth={1.75} aria-hidden="true" />
				Télécharger le bordereau
			</Bouton>
			{#if saisir && r.annulable}
				<span class="seulement-ordinateur">
					<Bouton variante="secondaire" onclick={() => (confirmer = true)}>
						Annuler la Remise
					</Bouton>
				</span>
			{/if}
		{/if}
	{/snippet}
</EnTete>

{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
{#if r.etat === 'annulee'}
	<Bandeau ton="fige">
		Cette Remise est annulée. Ses chèques sont revenus en attente, son numéro ne resservira pas.
	</Bandeau>
{/if}

<section class="total" aria-label="Total de la Remise">
	<p class="t-caption t-muted">{accordCheques(r.nombre)}</p>
	<p class="montant-lg">{formaterMontant(r.total)}</p>
</section>

{#if r.cheques.length > 0}
	<Tableau legende="Chèques de la Remise n° {r.numero}">
		<thead>
			<tr>
				<th scope="col">Émetteur</th>
				<th scope="col">Banque</th>
				{#if avecNumero}<th scope="col">N°</th>{/if}
				<th scope="col">Actions</th>
				<th scope="col">État</th>
				<th scope="col" class="droite">Montant</th>
			</tr>
		</thead>
		<tbody>
			{#each r.cheques as c (c.id)}
				<tr>
					<td class="principale">{c.emetteur}</td>
					<td>{c.banque ?? ''}</td>
					{#if avecNumero}<td>{c.numero ?? ''}</td>{/if}
					<td>{c.actions.join(', ')}</td>
					<td class="etat t-caption">{LIBELLES_ETAT_RECU[c.etat]}</td>
					<td class="montant">{formaterMontant(c.montant)}</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

{#if r.mouvements.length > 0}
	<section class="releve" aria-labelledby="titre-releve">
		<h2 id="titre-releve" class="t-heading">Au relevé</h2>
		<p class="t-muted">
			{#if r.avec.length > 0}
				La banque a réparti autrement que le bordereau. Pointée avec
				{#each r.avec as a, i (a.id)}{i > 0 ? ', ' : ''}<a href="/cheques/remises/{a.id}"
						>la Remise n° {a.numero}</a
					>{/each}.
			{:else if r.mouvements.length > 1}
				La banque a passé cette Remise en {r.mouvements.length} lignes.
			{:else}
				Pointée avec cette ligne de relevé.
			{/if}
		</p>
		<ul>
			{#each r.mouvements as m (m.id)}
				<li>
					<span class="date t-caption t-muted">{formaterDateCourte(m.date)}</span>
					<span class="libelle">{m.libelle}</span>
					<span class="montant">{formaterMontant(m.montant)}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<p class="t-caption">
	<a href={urlAvec({ op: String(r.operationId) })} data-sveltekit-reset="false">Voir l’Opération</a>
</p>

<Dialogue
	ouvert={confirmer}
	titre="Annuler la Remise n° {r.numero} ?"
	libelleAction="Annuler la Remise"
	libelleRevenir="Garder la Remise"
	danger
	{occupe}
	confirmer={annuler}
	revenir={() => (confirmer = false)}
>
	Ses {r.nombre} chèques redeviennent en attente. Le Journal garde la trace de cette Remise.
</Dialogue>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.total .montant-lg {
		text-align: left;
	}

	.etat {
		color: var(--ink-muted);
	}

	.releve {
		display: grid;
		gap: var(--espace-2);
	}

	.releve ul {
		display: grid;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.releve li {
		display: flex;
		align-items: baseline;
		gap: var(--espace-3);
		padding: var(--espace-2) var(--espace-3);
		border-bottom: 1px solid var(--border);
	}

	.releve li:last-child {
		border-bottom: 0;
	}

	.libelle {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.date {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}
</style>
