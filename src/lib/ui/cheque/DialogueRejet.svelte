<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { RangeeRecu } from '#lib/domaine/cheques/vues.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';

	type Props = { cheque: RangeeRecu; aujourdhui: string; fermer: () => void };

	let { cheque, aujourdhui, fermer }: Props = $props();

	let date = $state(untrack(() => aujourdhui));
	let occupe = $state(false);
	let erreur = $state<string | undefined>();
	let alerte = $state<string | null>(null);

	async function confirmer() {
		if (occupe) return;
		occupe = true;
		alerte = null;
		erreur = undefined;
		const r = await envoyer(`/api/cheques/recus/${cheque.id}/rejet`, { date });
		occupe = false;
		if (r.type === 'ok') {
			afficherToast('Chèque marqué comme rejeté.');
			fermer();
			await refreshAll();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = message('reseau_coupe');
		} else if (r.type === 'serveur') {
			alerte = message('erreur_serveur');
		} else if (r.erreur.details?.champ === 'date') {
			erreur = messageErreur(r.erreur);
		} else if (r.erreur.code === 'saisie_invalide') {
			erreur = message('date_invalide');
		} else {
			alerte = messageErreur(r.erreur);
		}
	}
</script>

<Dialogue
	ouvert
	saisie
	titre="Marquer ce chèque comme rejeté ?"
	libelleAction="Marquer comme rejeté"
	danger
	{occupe}
	{confirmer}
	revenir={fermer}
>
	<p>
		La recette de {formaterMontant(cheque.montant)} de {cheque.emetteur} sera annulée par une nouvelle
		Opération. Le chèque reste au registre, état Rejeté.
	</p>
	<div class="champ">
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
		<Champ
			etiquette="Date du rejet"
			id="rejet-date"
			name="date"
			type="date"
			bind:valeur={date}
			{erreur}
		/>
	</div>
</Dialogue>

<style>
	.champ {
		display: grid;
		gap: var(--espace-3);
		margin-top: var(--espace-3);
	}
</style>
