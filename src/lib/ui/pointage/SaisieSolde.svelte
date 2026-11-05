<script lang="ts">
	import { untrack } from 'svelte';
	import { lireMontant } from '#lib/domaine/montant.ts';
	import { message, messageErreur, type CodeMessage } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';

	type Props = {
		compteId: number;
		dateProposee: string;
		fermer: () => void;
		apres: () => Promise<void>;
	};

	let { compteId, dateProposee, fermer, apres }: Props = $props();

	let date = $state(untrack(() => dateProposee));
	let solde = $state('');
	let occupe = $state(false);
	let erreurs = $state<Record<string, string>>({});
	let alerte = $state<string | null>(null);

	async function enregistrer() {
		if (occupe) return;
		erreurs = {};
		alerte = null;
		const lu = lireMontant(solde);
		if (!lu.ok) {
			erreurs.solde = message('montant_invalide');
			return;
		}
		occupe = true;
		const r = await envoyer(`/api/pointage/comptes/${compteId}/solde`, { date, solde: lu.valeur });
		occupe = false;
		if (r.type === 'ok') {
			fermer();
			await apres();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau' || r.type === 'serveur') {
			alerte = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
		} else {
			alerte = messageErreur(r.erreur);
		}
	}
</script>

<Panneau ouvert titre="Solde du relevé" {fermer}>
	<form
		class="saisie"
		onsubmit={(e) => {
			e.preventDefault();
			enregistrer();
		}}
	>
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}
		<p class="t-muted">
			Votre fichier ne donne pas de solde. Recopiez celui de votre relevé : il sert à contrôler le
			solde calculé, au centime.
		</p>
		<ChampMontant
			etiquette="Solde du relevé"
			name="solde-montant"
			bind:valeur={solde}
			erreur={erreurs.solde}
		/>
		<Champ
			etiquette="À la date du"
			name="solde-date"
			type="date"
			bind:valeur={date}
			erreur={erreurs.date}
		/>
		<button class="visuellement-cache" type="submit" tabindex="-1" aria-hidden="true">
			Enregistrer
		</button>
	</form>

	{#snippet pied()}
		<Bouton {occupe} onclick={enregistrer}>Enregistrer le solde</Bouton>
		<Bouton variante="discret" onclick={fermer}>Plus tard</Bouton>
	{/snippet}
</Panneau>

<style>
	.saisie {
		display: grid;
		gap: var(--espace-4);
	}
</style>
