<script lang="ts">
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from './api.ts';
	import Bandeau from './Bandeau.svelte';
	import Champ from './Champ.svelte';
	import Dialogue from './Dialogue.svelte';
	import { reconnexion } from './reconnexion.svelte.ts';
	import { afficherToast } from './toasts.svelte.ts';

	let { identifiant }: { identifiant: string } = $props();

	let motDePasse = $state('');
	let erreur = $state<string | null>(null);
	let occupe = $state(false);

	async function reconnecter() {
		if (occupe) return;
		occupe = true;
		const r = await envoyer<true>('/api/reconnexion', { identifiant, motDePasse });
		occupe = false;
		if (r.type === 'ok') {
			motDePasse = '';
			erreur = null;
			reconnexion.ouverte = false;
			afficherToast('Reconnecté. Votre saisie est intacte.');
			reconnexion.apres?.();
		} else if (r.type === 'refus') {
			erreur = messageErreur(r.erreur);
		} else {
			erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		}
	}
</script>

<Dialogue
	ouvert={reconnexion.ouverte}
	titre="Reconnectez-vous"
	libelleAction="Se reconnecter"
	libelleRevenir="Plus tard"
	saisie
	{occupe}
	confirmer={reconnecter}
	revenir={() => (reconnexion.ouverte = false)}
>
	<div class="pile">
		<p>{message('session_expiree')}</p>
		{#if erreur}<Bandeau ton="erreur" alerte>{erreur}</Bandeau>{/if}
		<Champ
			etiquette="Mot de passe"
			name="reconnexion-mot-de-passe"
			type="password"
			autocomplete="current-password"
			bind:valeur={motDePasse}
			onkeydown={(e: KeyboardEvent) => {
				if (e.key === 'Enter') reconnecter();
			}}
		/>
	</div>
</Dialogue>

<style>
	.pile {
		display: grid;
		gap: var(--espace-3);
	}
</style>
