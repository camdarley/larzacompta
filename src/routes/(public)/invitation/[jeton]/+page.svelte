<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, Clock } from '@lucide/svelte';
	import { LONGUEUR_MIN_MOT_DE_PASSE } from '#lib/domaine/acces.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Carte from '#lib/ui/Carte.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	let { data, form } = $props();
	let occupe = $state(false);
	let motDePasse = $state('');

	const initial = $derived(data.invitation?.type === 'initial');
	const titre = $derived(
		data.refus
			? 'Lien expiré'
			: initial
				? 'Créez votre Accès'
				: data.invitation?.type === 'reinitialisation'
					? 'Choisissez un nouveau mot de passe'
					: 'Choisissez votre mot de passe'
	);
	const longueur = $derived([...motDePasse].length);
	const manque = $derived(LONGUEUR_MIN_MOT_DE_PASSE - longueur);
</script>

<Carte etroite>
	<EnTete {titre} contexte="Invitation" petit />
	{#if data.refus}
		<p class="texte">{data.refus}</p>
		<Bouton href="/connexion" variante="secondaire">Aller à la connexion</Bouton>
	{:else}
		{#if data.invitation?.nomAffiche}
			<p class="texte">Bonjour {data.invitation.nomAffiche}.</p>
		{:else}
			<p class="texte">Cet Accès tiendra la trésorerie de votre APE.</p>
		{/if}
		<form
			method="post"
			class="formulaire"
			use:enhance={({ cancel }) => {
				if (occupe) return cancel();
				occupe = true;
				return async ({ update }) => {
					await update({ reset: false });
					occupe = false;
				};
			}}
		>
			{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
				<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
			{/if}
			{#if initial}
				<Champ
					etiquette="Identifiant"
					name="identifiant"
					autocomplete="username"
					aide="Celui que vous taperez pour vous connecter."
					required
					valeur={String(form?.saisie?.identifiant ?? '')}
					erreur={form?.erreur?.champs.identifiant}
				/>
				<Champ
					etiquette="Nom affiché"
					name="nomAffiche"
					autocomplete="name"
					aide="Il apparaît dans le Journal des modifications."
					required
					valeur={String(form?.saisie?.nomAffiche ?? '')}
					erreur={form?.erreur?.champs.nomAffiche}
				/>
			{/if}
			<Champ
				etiquette="Mot de passe"
				name="motDePasse"
				type="password"
				autocomplete="new-password"
				required
				bind:valeur={motDePasse}
				erreur={form?.erreur?.champs.motDePasse}
			>
				{#snippet apres()}
					<p class="longueur t-caption" class:assez={manque <= 0} aria-live="polite">
						{#if manque <= 0}
							<Check size={16} strokeWidth={2} aria-hidden="true" />
							Longueur suffisante
						{:else}
							<Clock size={16} strokeWidth={1.75} aria-hidden="true" />
							{longueur} sur {LONGUEUR_MIN_MOT_DE_PASSE} caractères, sans règle particulière
						{/if}
					</p>
				{/snippet}
			</Champ>
			<Bouton type="submit" {occupe} pleineLargeur>Enregistrer et continuer</Bouton>
		</form>
	{/if}
</Carte>

<style>
	.texte {
		margin: var(--espace-3) 0 var(--espace-4);
	}

	.formulaire {
		display: grid;
		gap: var(--espace-4);
	}

	.longueur {
		display: flex;
		align-items: center;
		gap: var(--espace-1);
		color: var(--ink-muted);
	}

	.assez {
		color: var(--success);
	}
</style>
