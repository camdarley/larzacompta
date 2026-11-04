<script lang="ts">
	import { enhance } from '$app/forms';
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { THEMES, type Theme } from '#lib/domaine/acces.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CaseACocher from '#lib/ui/CaseACocher.svelte';
	import Carte from '#lib/ui/Carte.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';

	let { data, form } = $props();

	const envoiPreferences = creerEnvoi();
	const envoiMotDePasse = creerEnvoi({ vider: true });

	let formulaire = $state<HTMLFormElement | null>(null);
	// Choix locaux : ils partent du serveur, puis l'écran les applique tout de suite.
	let theme = $state<Theme>(untrack(() => data.preferences.theme));
	let raccourcis = $state(untrack(() => data.preferences.raccourcis));

	const libelles = { systeme: 'Système', clair: 'Clair', sombre: 'Sombre' };
	const icones = { systeme: Monitor, clair: Sun, sombre: Moon };

	function appliquer() {
		document.documentElement.dataset.theme = theme;
		formulaire?.requestSubmit();
	}

	const erreurs = $derived(form?.erreur?.champs ?? {});
</script>

<EnTete titre="Préférences" sousTitre="Ces choix vous suivent à chaque connexion." />

<div class="cartes">
	<Carte>
		<h2 class="t-heading">Affichage</h2>
		<form
			bind:this={formulaire}
			method="post"
			action="?/preferences"
			class="pile"
			use:enhance={envoiPreferences.soumettre}
		>
			<fieldset>
				<legend class="t-label">Thème</legend>
				<div class="themes">
					{#each THEMES as t (t)}
						{@const Icone = icones[t]}
						<label class:choisi={theme === t}>
							<input type="radio" name="theme" value={t} bind:group={theme} onchange={appliquer} />
							<Icone size={20} strokeWidth={1.75} aria-hidden="true" />
							{libelles[t]}
						</label>
					{/each}
				</div>
			</fieldset>
			<div onchange={appliquer}>
				<CaseACocher
					name="raccourcis"
					bind:coche={raccourcis}
					aide="Les raccourcis à une touche ne s’activent jamais pendant une saisie."
				>
					Activer les raccourcis du clavier
				</CaseACocher>
			</div>
		</form>
	</Carte>

	<Carte>
		<h2 class="t-heading">Mot de passe</h2>
		<form method="post" action="?/motDePasse" class="pile" use:enhance={envoiMotDePasse.soumettre}>
			<Champ
				etiquette="Mot de passe actuel"
				name="actuel"
				type="password"
				autocomplete="current-password"
				required
				erreur={erreurs.actuel}
			/>
			<Champ
				etiquette="Nouveau mot de passe"
				name="nouveau"
				type="password"
				autocomplete="new-password"
				aide="12 caractères ou plus, sans règle particulière."
				required
				erreur={erreurs.nouveau}
			/>
			<div>
				<Bouton type="submit" occupe={envoiMotDePasse.occupe}>Changer le mot de passe</Bouton>
			</div>
		</form>
	</Carte>
</div>

<style>
	.cartes {
		display: grid;
		gap: var(--espace-5);
		max-width: var(--espace-reading-max);
		margin-top: var(--espace-5);
	}

	.pile {
		display: grid;
		gap: var(--espace-4);
		margin-top: var(--espace-4);
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.themes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
		margin-top: var(--espace-2);
	}

	.themes label {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-touch);
		padding: 0 var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
		color: var(--ink);
		cursor: pointer;
	}

	.themes label.choisi {
		border: 2px solid var(--primary);
		background: var(--primary-soft);
		color: var(--primary);
		font-weight: var(--typo-label-graisse);
	}

	.themes input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.themes label:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
</style>
