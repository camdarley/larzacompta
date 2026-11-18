<script lang="ts">
	import { enhance } from '$app/forms';
	import { capitaliser, nomDuMois } from '#lib/domaine/dates.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampZone from '#lib/ui/ChampZone.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';

	let { data, form } = $props();
	const envoi = creerEnvoi();

	const mois = Array.from({ length: 12 }, (_, i) => ({
		valeur: String(i + 1),
		libelle: capitaliser(nomDuMois(i + 1))
	}));
	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const a = $derived(data.association);
</script>

<EnTete
	titre="Association"
	contexte="Réglages"
	sousTitre="L’identité de votre association, sur l’écran comme sur les documents."
/>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

<dl class="lecture seulement-telephone">
	<div>
		<dt class="t-label">Nom</dt>
		<dd>{a?.nom ?? '—'}</dd>
	</div>
	<div>
		<dt class="t-label">Adresse</dt>
		<dd>{a?.adresse || '—'}</dd>
	</div>
	<div>
		<dt class="t-label">Début d’Exercice</dt>
		<dd>{a ? nomDuMois(a.moisDebutExercice) : '—'}</dd>
	</div>
	<div>
		<dt class="t-label">Mentions de facture</dt>
		<dd class="mentions">{a?.mentionsFacture || '—'}</dd>
	</div>
</dl>

<form method="post" class="formulaire seulement-ordinateur" use:enhance={envoi.soumettre}>
	<Champ
		etiquette="Nom de l’association"
		name="nom"
		required
		valeur={saisie.nom ?? a?.nom ?? ''}
		erreur={form?.erreur?.champs.nom}
	/>
	<ChampZone
		etiquette="Adresse"
		name="adresse"
		autocomplete="street-address"
		valeur={saisie.adresse ?? a?.adresse ?? ''}
		erreur={form?.erreur?.champs.adresse}
	/>
	<ChampListe
		etiquette="Mois de début d’Exercice"
		name="moisDebutExercice"
		options={mois}
		aide="S’applique aux Exercices à venir. Ceux déjà ouverts gardent leurs dates."
		valeur={saisie.moisDebutExercice ?? String(a?.moisDebutExercice ?? 9)}
	/>
	<ChampZone
		etiquette="Mentions de facture"
		name="mentionsFacture"
		lignes={5}
		autocomplete="off"
		aide="Vides par défaut. Elles s’impriment en bas de chaque Facture, telles quelles. À vérifier selon la situation de votre association : TVA, SIRET, conditions de règlement."
		valeur={saisie.mentionsFacture ?? a?.mentionsFacture ?? ''}
		erreur={form?.erreur?.champs.mentionsFacture}
	/>
	<div class="actions"><Bouton type="submit" occupe={envoi.occupe}>Enregistrer</Bouton></div>
</form>

<style>
	.formulaire {
		display: grid;
		gap: var(--espace-4);
		max-width: var(--espace-reading-max);
	}

	.actions {
		display: flex;
	}

	.lecture {
		display: grid;
		gap: var(--espace-3);
	}

	dt {
		color: var(--ink-muted);
	}

	.mentions {
		white-space: pre-line;
	}
</style>
