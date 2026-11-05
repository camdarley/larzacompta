<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Ellipsis, ReceiptText } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import {
		ETATS_CHEQUE_RECU,
		LIBELLES_ETAT_RECU,
		type EtatChequeRecu
	} from '#lib/domaine/cheques/index.ts';
	import type { RangeeRecu } from '#lib/domaine/cheques/vues.ts';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import { dateProposee } from '#lib/domaine/operations/lecture.ts';
	import { messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import DialogueRejet from '#lib/ui/cheque/DialogueRejet.svelte';
	import FiltreEtat from '#lib/ui/cheque/FiltreEtat.svelte';
	import PanneauCheque from '#lib/ui/cheque/PanneauCheque.svelte';
	import SaisieRafale, { type EtatRafale } from '#lib/ui/cheque/SaisieRafale.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const v = $derived(data.vue);
	const saisir = $derived(data.saisie !== null);
	const q = $derived(page.url.searchParams);

	const aujourdhui = $derived(data.saisie?.aujourdhui ?? '');
	const datePour = () => {
		const c = untrack(() => data.saisie);
		if (c === null) return '';
		const ouvert = c.exercices.filter((e) => e.statut === 'ouvert').at(-1) ?? null;
		return dateProposee(c.aujourdhui, ouvert);
	};

	let rafale = $state<EtatRafale>({
		emetteur: '',
		banque: '',
		date: datePour(),
		montant: '',
		actionId: null,
		natureId: null
	});
	let dernier = $state('');

	/** À remettre par défaut : c'est la liste de travail. `etat=tous` montre tout le registre. */
	const filtre = $derived.by((): EtatChequeRecu | null => {
		const voulu = q.get('etat');
		if (voulu === 'tous') return null;
		return ETATS_CHEQUE_RECU.includes(voulu as EtatChequeRecu)
			? (voulu as EtatChequeRecu)
			: 'en_attente';
	});
	const rangees = $derived(v.rangees.filter((r) => filtre === null || r.etat === filtre));
	const options = $derived([
		...ETATS_CHEQUE_RECU.map((e) => ({
			valeur: e === 'en_attente' ? null : e,
			libelle: LIBELLES_ETAT_RECU[e],
			compteur: v.compteurs[e]
		})),
		{ valeur: 'tous', libelle: 'Tous', compteur: v.rangees.length }
	]);
	const actifFiltre = $derived(filtre === null ? 'tous' : filtre === 'en_attente' ? null : filtre);

	let aRejeter = $state<RangeeRecu | null>(null);
	let aAnnuler = $state<RangeeRecu | null>(null);
	let occupe = $state(false);

	const mot = (r: RangeeRecu) => LIBELLES_ETAT_RECU[r.etat];

	async function poster(url: string, reussi: string) {
		occupe = true;
		const r = await envoyer(url);
		occupe = false;
		aAnnuler = null;
		if (r.type === 'ok') {
			afficherToast(reussi);
			await refreshAll();
		} else if (r.type === 'refus') {
			afficherToast(messageErreur(r.erreur));
		} else {
			afficherToast(
				messageErreur({ code: r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur' })
			);
		}
	}

	const panneauOuvert = $derived(saisir && q.has('cheque'));
	const fermerPanneau = () => changerUrl({ cheque: null });
	const focusRangee = () =>
		document.getElementById('rafale-emetteur')?.scrollIntoView({ block: 'center' });

	function apresPanneau(nom: string) {
		if (q.get('cheque') === 'nouveau') {
			rafale.emetteur = '';
			rafale.banque = '';
			rafale.montant = '';
			dernier = `Chèque de ${nom} enregistré.`;
		}
	}
</script>

<EnTete
	titre="Chèques"
	onglet="Reçus"
	aide={{ ancre: 'cheque-recu', texte: 'Qu’est-ce qu’un Chèque reçu ?' }}
	sousTitre="Chaque chèque compte dès sa réception, et attend sa Remise."
>
	{#snippet actions()}
		{#if saisir && v.compteurs.en_attente > 0}
			<span class="seulement-ordinateur">
				<Bouton href="/cheques/remises/nouvelle">Nouvelle Remise</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if v.totalAttente > 0}
	<section class="total" aria-label="Total à remettre">
		<p class="t-caption t-muted">Total à remettre</p>
		<p class="montant-lg">{formaterMontant(v.totalAttente)}</p>
	</section>
{/if}

{#if data.saisie}
	<SaisieRafale
		contexte={data.saisie}
		natureParAction={v.natureParAction}
		banques={v.banques}
		{rafale}
		bind:dernier
	/>
{/if}

<FiltreEtat nom="Filtrer par état" {options} actif={actifFiltre} />

{#if rangees.length === 0}
	{#if filtre === 'en_attente'}
		<EtatVide
			icone={ReceiptText}
			titre="Aucun chèque à remettre"
			phrase="Les Chèques reçus attendront ici leur Remise."
		>
			{#snippet action()}
				{#if saisir}
					<span class="seulement-ordinateur">
						<Bouton
							onclick={() => {
								focusRangee();
								document.getElementById('rafale-emetteur')?.focus();
							}}
						>
							Enregistrer un Chèque reçu
						</Bouton>
					</span>
				{/if}
			{/snippet}
		</EtatVide>
	{:else}
		<p class="vide t-muted">Aucun chèque dans cet état.</p>
	{/if}
{:else}
	<Tableau legende="Chèques reçus">
		<thead>
			<tr>
				<th scope="col">Reçu le</th>
				<th scope="col">Émetteur</th>
				<th scope="col">Banque</th>
				<th scope="col">Actions</th>
				<th scope="col">État</th>
				<th scope="col" class="droite">Montant</th>
				{#if saisir}
					<th scope="col" class="seulement-ordinateur">
						<span class="visuellement-cache">Gestes</span>
					</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rangees as r (r.id)}
				<tr>
					<td class="date">{formaterDateCourte(r.date)}</td>
					<td class="principale">{r.emetteur}</td>
					<td>{r.banque ?? ''}</td>
					<td>{r.actions.join(', ')}</td>
					<td class="etat t-caption">
						{#if r.remise}
							{mot(r)},
							<a href="/cheques/remises/{r.remise.id}">Remise n° {r.remise.numero}</a>
						{:else}
							{mot(r)}
						{/if}
					</td>
					<td class="montant">{formaterMontant(r.montant)}</td>
					{#if saisir}
						<td class="gestes seulement-ordinateur">
							<Menu nom="Gestes sur le chèque de {r.emetteur}" flottant classe="bouton-rangee">
								{#snippet bouton()}
									<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
								{/snippet}
								{#if r.etat === 'en_attente'}
									<button type="button" onclick={() => changerUrl({ cheque: String(r.id) })}>
										Modifier
									</button>
								{/if}
								{#if r.etat !== 'rejete'}
									<button type="button" onclick={() => (aRejeter = r)}>
										Marquer comme rejeté
									</button>
								{:else}
									<button
										type="button"
										onclick={() =>
											poster(`/api/cheques/recus/${r.id}/rejet/annuler`, 'Rejet annulé.')}
									>
										Annuler le rejet
									</button>
								{/if}
								<button
									type="button"
									onclick={() => goto(urlAvec({ op: String(r.operationId) }), { reset: false })}
								>
									Voir l’Opération
								</button>
								{#if r.etat === 'en_attente'}
									<button type="button" onclick={() => (aAnnuler = r)}>Annuler ce chèque</button>
								{/if}
							</Menu>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<p class="t-caption t-muted pied">
	<AideTerme ancre="remise">Remise</AideTerme> : le paquet que vous déposez à la banque, avec son bordereau.
</p>

{#if panneauOuvert && data.saisie}
	{#key q.get('cheque')}
		<PanneauCheque
			contexte={data.saisie}
			fiche={data.fiche}
			{rafale}
			banques={v.banques}
			fermer={fermerPanneau}
			apres={apresPanneau}
		/>
	{/key}
{/if}

{#if aRejeter}
	<DialogueRejet cheque={aRejeter} {aujourdhui} fermer={() => (aRejeter = null)} />
{/if}

{#if aAnnuler}
	<Dialogue
		ouvert
		titre="Annuler ce chèque ?"
		libelleAction="Annuler ce chèque"
		libelleRevenir="Garder le chèque"
		danger
		{occupe}
		confirmer={() => poster(`/api/cheques/recus/${aAnnuler?.id}/annuler`, 'Chèque annulé.')}
		revenir={() => (aAnnuler = null)}
	>
		Pour une erreur de saisie : le chèque de {aAnnuler.emetteur} sort de la liste et des soldes. Le Journal
		en garde la trace.
	</Dialogue>
{/if}

<style>
	.total .montant-lg {
		text-align: left;
	}

	.date {
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.etat {
		color: var(--ink-muted);
	}

	.gestes {
		width: 1%;
		text-align: right;
	}

	.vide {
		padding: var(--espace-5) 0;
		text-align: center;
	}

	.pied {
		margin-top: calc(-1 * var(--espace-2));
	}

	:global(.bouton-rangee) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--ink-muted);
		cursor: pointer;
	}

	:global(.bouton-rangee:hover) {
		background: var(--surface-sunken);
		color: var(--ink);
	}
</style>
