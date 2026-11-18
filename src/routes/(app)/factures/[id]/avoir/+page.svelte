<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';
	import { formaterDateLongue } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import ApercuPdf from '#lib/ui/facture/ApercuPdf.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';

	let { data } = $props();

	const f = $derived(data.vue.facture);
	const plan = $derived(data.plan);
	let confirmer = $state(false);
	let occupe = $state(false);
	let alerte = $state<string | null>(null);

	async function creer() {
		if (occupe) return;
		occupe = true;
		const r = await envoyer<{ id: number; numero: string }>(`/api/factures/${f.id}/avoir`);
		occupe = false;
		confirmer = false;
		if (r.type === 'ok') {
			afficherToast(`Avoir n° ${r.valeur.numero} créé.`);
			await goto(`/factures/${r.valeur.id}`, { invalidateAll: true });
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'refus') {
			alerte = messageErreur(r.erreur);
		} else {
			alerte = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		}
	}
</script>

<a class="retour" href="/factures/{f.id}">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Facture n° {f.numero}
</a>

<EnTete
	titre="Créer un Avoir"
	contexte="Factures"
	sousTitre="Il annule toute la facture n° {f.numero}, pour {f.tiersNom}."
	aide={{ ancre: 'avoir', texte: 'Qu’est-ce qu’un Avoir ?' }}
/>

<ReserveOrdinateur />

<div class="avoir seulement-ordinateur">
	<div class="plan">
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
		<div class="pose">
			<CalculPose
				termes={[
					{ libelle: 'Montant de la facture', montant: plan.total },
					{ libelle: 'Déjà encaissé', montant: plan.detteOuverte, signe: '−' }
				]}
				totalLibelle="Reste dû annulé"
				total={plan.resteAnnule}
			/>
		</div>
		{#if plan.detteOuverte > 0}
			<Bandeau ton="regarder">
				L’association a déjà encaissé {formaterMontant(plan.detteOuverte)} : une Dette de ce montant s’ouvre
				envers
				{f.tiersNom}, à rembourser.
			</Bandeau>
		{:else}
			<p>Rien n’a été encaissé : la Créance s’éteint, et aucune Dette ne s’ouvre.</p>
		{/if}
		<p class="t-muted">
			Daté du {formaterDateLongue(plan.date)}, il prend le prochain numéro de la suite. Le résultat
			ne bouge pas : un Avoir ne produit aucune Ligne.
		</p>
		<div class="actions">
			<Bouton onclick={() => (confirmer = true)}>Créer l’Avoir…</Bouton>
			<Bouton variante="secondaire" href="/factures/{f.id}">Revenir à la facture</Bouton>
		</div>
	</div>

	<section class="colonne-apercu" aria-label="Aperçu de l’Avoir">
		<ApercuPdf src="/factures/{f.id}/avoir/apercu" titre="Aperçu de l’Avoir" />
	</section>
</div>

<Dialogue
	ouvert={confirmer}
	titre="Créer cet Avoir ?"
	libelleAction="Créer l’Avoir"
	{occupe}
	confirmer={creer}
	revenir={() => (confirmer = false)}
>
	<p>
		Il recevra le n° {plan.numero} et annulera la facture n° {f.numero}, de
		{formaterMontant(plan.total)}. Cela ne se défait pas.
	</p>
</Dialogue>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.avoir {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--espace-5);
		margin-top: var(--espace-4);
	}

	.plan {
		display: grid;
		gap: var(--espace-4);
		min-width: 0;
	}

	.pose {
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
	}

	.colonne-apercu {
		position: sticky;
		top: var(--espace-4);
		min-width: 0;
	}

	@media (max-width: 1279.98px) {
		.avoir {
			grid-template-columns: minmax(0, 1fr);
		}

		.colonne-apercu {
			position: static;
		}
	}
</style>
