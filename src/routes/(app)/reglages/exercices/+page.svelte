<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { CalendarDays, Plus } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { libelleExercice } from '#lib/domaine/exercices.ts';
	import { formaterSaisie } from '#lib/domaine/montant.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const tenus = $derived(data.exercices.filter((e) => e.statut !== 'repere'));
	// Le bouton reste cliquable à deux Exercices ouverts : le refus explique pourquoi (EXPERIENCE.md).
	const peutOuvrirSuivant = $derived(tenus.length > 0);

	const parametre = $derived(page.url.searchParams.get('panneau'));
	const balance = $derived(
		data.exercices.find((e) => `balance-${e.id}` === parametre && e.statut === 'ouvert') ?? null
	);
	const fermer = () => changerUrl({ panneau: null });
	const envoi = creerEnvoi({ apres: fermer });
	const envoiSuivant = creerEnvoi();

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const annees = $derived(
		[0, -1].map((d) => ({
			valeur: String(data.anneeCourante + d),
			libelle: libelleExercice(data.anneeCourante + d, data.moisDebut)
		}))
	);
	const soldeDe = (compte: (typeof data.comptes)[number], exerciceId: number) =>
		compte.ancre?.exerciceId === exerciceId ? formaterSaisie(compte.ancre.solde) : '';
</script>

<EnTete
	titre="Exercices"
	contexte="Réglages"
	sousTitre="Deux Exercices peuvent être ouverts en même temps, le temps de finir une année et de commencer la suivante."
>
	{#snippet actions()}
		{#if peutOuvrirSuivant}
			<form
				method="post"
				action="?/suivant"
				class="seulement-ordinateur"
				use:enhance={envoiSuivant.soumettre}
			>
				<Bouton type="submit" occupe={envoiSuivant.occupe}>Ouvrir l’Exercice suivant</Bouton>
			</form>
		{/if}
		<span class="seulement-ordinateur">
			<Bouton variante="secondaire" href={urlAvec({ panneau: 'repere' })} conserverFocus>
				<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
				Ajouter un repère
			</Bouton>
		</span>
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

{#if tenus.length === 0}
	{#if data.exercices.length === 0}
		<EtatVide
			icone={CalendarDays}
			titre="Pas encore d’Exercice"
			phrase="Ouvrez votre premier Exercice : chaque Compte y reçoit son solde de départ."
		>
			{#snippet action()}
				<span class="seulement-ordinateur">
					<Bouton href={urlAvec({ panneau: 'premier' })} conserverFocus
						>Ouvrir le premier Exercice</Bouton
					>
				</span>
			{/snippet}
		</EtatVide>
	{:else}
		<div class="seulement-ordinateur">
			<Bouton href={urlAvec({ panneau: 'premier' })} conserverFocus
				>Ouvrir le premier Exercice</Bouton
			>
		</div>
	{/if}
{/if}

{#if data.exercices.length > 0}
	<Tableau legende="Exercices">
		<thead>
			<tr>
				<th scope="col">Exercice</th>
				<th scope="col">Du</th>
				<th scope="col">Au</th>
				<th scope="col">État</th>
				<th scope="col" class="seulement-ordinateur"
					><span class="visuellement-cache">Actions</span></th
				>
			</tr>
		</thead>
		<tbody>
			{#each data.exercices as e (e.id)}
				<tr>
					<td class="principale">{e.libelle}</td>
					<td>{e.debut ? formaterDateCourte(e.debut) : '—'}</td>
					<td>{e.fin ? formaterDateCourte(e.fin) : '—'}</td>
					<td>
						{#if e.statut === 'ouvert'}
							<Pastille etat="ouvert" />
						{:else if e.statut === 'cloture'}
							<Pastille etat="cloture" />
						{:else}
							<span class="t-caption t-muted">Repère</span>
						{/if}
					</td>
					<td class="seulement-ordinateur droite">
						{#if e.statut === 'ouvert'}
							<a href={urlAvec({ panneau: `balance-${e.id}` })} data-sveltekit-reset="false">
								Balance d’ouverture
							</a>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<Panneau ouvert={parametre === 'premier'} titre="Premier Exercice" {fermer}>
	<form
		id="form-premier"
		method="post"
		action="?/premier"
		class="pile"
		use:enhance={envoi.soumettre}
	>
		<ChampListe
			etiquette="Exercice"
			name="anneeDebut"
			options={annees}
			valeur={saisie.anneeDebut ?? annees[0]?.valeur}
		/>
		<fieldset class="soldes">
			<legend class="t-label">Balance d’ouverture</legend>
			{#each data.comptes as c (c.id)}
				<ChampMontant
					etiquette={c.libelle}
					name="solde-{c.id}"
					valeur={saisie[`solde-${c.id}`] ?? ''}
					erreur={erreurs[`solde-${c.id}`]}
				/>
			{:else}
				<p class="t-muted">Aucun Compte pour l’instant : les prochains partiront de 0,00 €.</p>
			{/each}
		</fieldset>
	</form>
	{#snippet pied()}
		<Bouton type="submit" form="form-premier" occupe={envoi.occupe}>Ouvrir l’Exercice</Bouton>
	{/snippet}
</Panneau>

<Panneau ouvert={parametre === 'repere'} titre="Exercice repère" {fermer}>
	<form id="form-repere" method="post" action="?/repere" class="pile" use:enhance={envoi.soumettre}>
		<p>
			Un repère sert seulement à rattacher une dépense à une année tenue ailleurs. Il n’a ni dates,
			ni solde.
		</p>
		<Champ
			etiquette="Nom de l’Exercice"
			name="libelle"
			required
			aide="Par exemple 2024-2025."
			valeur={saisie.libelle ?? ''}
			erreur={erreurs.libelle}
		/>
	</form>
	{#snippet pied()}
		<Bouton type="submit" form="form-repere" occupe={envoi.occupe}>Ajouter le repère</Bouton>
	{/snippet}
</Panneau>

<Panneau ouvert={balance !== null} titre="Balance d’ouverture de {balance?.libelle ?? ''}" {fermer}>
	{#key parametre}
		{#if balance}
			{@const exerciceId = balance.id}
			<form
				id="form-balance"
				method="post"
				action="?/balance"
				class="pile"
				use:enhance={envoi.soumettre}
			>
				<input type="hidden" name="exerciceId" value={exerciceId} />
				<p class="t-muted">
					Soldes au {balance.debut ? formaterDateCourte(balance.debut) : ''}. Un Compte ancré sur un
					autre Exercice garde son ancre.
				</p>
				{#each data.comptes.filter((c) => !c.ancre || c.ancre.exerciceId === exerciceId) as c (c.id)}
					<ChampMontant
						etiquette={c.libelle}
						name="solde-{c.id}"
						valeur={saisie[`solde-${c.id}`] ?? soldeDe(c, exerciceId)}
						erreur={erreurs[`solde-${c.id}`]}
					/>
				{:else}
					<p class="t-muted">Aucun Compte n’est ancré sur cet Exercice.</p>
				{/each}
			</form>
		{/if}
	{/key}
	{#snippet pied()}
		<Bouton type="submit" form="form-balance" occupe={envoi.occupe}>Enregistrer</Bouton>
	{/snippet}
</Panneau>

<style>
	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.soldes {
		display: grid;
		gap: var(--espace-3);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.droite {
		text-align: right;
		white-space: nowrap;
	}
</style>
