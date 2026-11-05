<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { message } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Carte from '#lib/ui/Carte.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';

	let { data, form } = $props();
	let occupe = $state(false);

	const lienOublie = $derived.by(() => {
		const url = new URL(page.url.href);
		url.searchParams.set('oublie', '1');
		return url.pathname + url.search;
	});
</script>

<Carte etroite>
	<EnTete titre={data.nomApe} contexte="Connexion" petit />
	<form
		method="post"
		class="formulaire"
		novalidate
		use:enhance={({ cancel }) => {
			if (occupe) return cancel();
			occupe = true;
			return async ({ update }) => {
				await update({ reset: false });
				occupe = false;
			};
		}}
	>
		{#if form?.erreur && !form.erreur.champs.identifiant && !form.erreur.champs.motDePasse}
			<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
		{/if}
		<Champ
			etiquette="Identifiant"
			name="identifiant"
			autocomplete="username"
			required
			valeur={String(form?.saisie?.identifiant ?? '')}
			erreur={form?.erreur?.champs.identifiant}
		/>
		<Champ
			etiquette="Mot de passe"
			name="motDePasse"
			type="password"
			autocomplete="current-password"
			required
			erreur={form?.erreur?.champs.motDePasse}
		/>
		<Bouton type="submit" {occupe} pleineLargeur>Se connecter</Bouton>
	</form>
	{#if data.oublie}
		<p class="oublie t-caption">{message('mot_de_passe_perdu')}</p>
	{:else}
		<a class="lien t-caption" href={lienOublie} data-sveltekit-reset="false"
			>Mot de passe oublié ?</a
		>
	{/if}
</Carte>

<style>
	.formulaire {
		display: grid;
		gap: var(--espace-4);
		margin-top: var(--espace-5);
	}

	.lien {
		display: inline-flex;
		align-items: center;
		min-height: var(--espace-touch);
		margin-top: var(--espace-2);
	}

	.oublie {
		margin-top: var(--espace-4);
		color: var(--ink-muted);
	}
</style>
