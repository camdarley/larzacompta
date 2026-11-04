<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Plus, Tags } from '@lucide/svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CaseACocher from '#lib/ui/CaseACocher.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const parametre = $derived(page.url.searchParams.get('nature'));
	const nouveau = $derived(parametre === 'nouvelle');
	const nature = $derived(data.natures.find((n) => String(n.id) === parametre) ?? null);
	const fermer = () => changerUrl({ nature: null });
	const envoi = creerEnvoi({ apres: fermer });
	const envoiEtat = creerEnvoi({ apres: fermer });

	let confirmerSuppression = $state(false);

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const groupes = $derived(data.groupes.map((g) => ({ valeur: String(g.id), libelle: g.libelle })));
	const nomGroupe = (id: number) => data.groupes.find((g) => g.id === id)?.libelle ?? '—';
	const systeme = $derived(nature?.codeSysteme !== null && nature !== null);
</script>

<EnTete
	titre="Natures"
	contexte="Réglages"
	sousTitre="La catégorie de chaque recette ou dépense. Une Nature n’a pas de sens : la même peut servir aux deux."
>
	{#snippet actions()}
		<span class="seulement-ordinateur">
			<Bouton href={urlAvec({ nature: 'nouvelle' })} conserverFocus>
				<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
				Créer une Nature
			</Bouton>
		</span>
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

{#if data.natures.length === 0}
	<EtatVide
		icone={Tags}
		titre="Pas encore de Nature"
		phrase="Décrivez d’abord votre APE : les Natures de l’outil s’ajoutent alors d’elles-mêmes."
	/>
{:else}
	<Tableau legende="Natures">
		<thead>
			<tr>
				<th scope="col">Nature</th>
				<th scope="col">Groupe</th>
				<th scope="col">État</th>
			</tr>
		</thead>
		<tbody>
			{#each data.natures as n (n.id)}
				<tr>
					<td class="principale">
						<a href={urlAvec({ nature: String(n.id) })} data-sveltekit-reset="false">{n.libelle}</a>
					</td>
					<td>{nomGroupe(n.groupeId)}</td>
					<td class="t-caption t-muted">
						{#if n.codeSysteme}Nature de l’outil{:else if n.neutre}Hors résultat{/if}
						{#if !n.actif}Désactivée{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<Panneau
	ouvert={nouveau || nature !== null}
	titre={nouveau ? 'Nouvelle Nature' : (nature?.libelle ?? '')}
	{fermer}
>
	{#if systeme}
		<p>Cette Nature sert au calcul de l’outil : elle reste telle quelle.</p>
	{:else}
		{#key parametre}
			<form
				id="form-nature"
				method="post"
				action={nouveau ? '?/creer' : '?/modifier'}
				class="pile"
				use:enhance={envoi.soumettre}
			>
				{#if nature}<input type="hidden" name="id" value={nature.id} />{/if}
				<Champ
					etiquette="Nom de la Nature"
					name="libelle"
					required
					valeur={saisie.libelle ?? nature?.libelle ?? ''}
					erreur={erreurs.libelle}
				/>
				<ChampListe
					etiquette="Groupe"
					name="groupeId"
					options={groupes}
					valeur={saisie.groupeId ?? String(nature?.groupeId ?? groupes[0]?.valeur ?? '')}
					erreur={erreurs.groupeId}
				/>
				<CaseACocher
					name="neutre"
					coche={nature?.neutre ?? false}
					aide="Reçu puis rendu, par exemple : la somme reste hors du résultat."
				>
					Somme neutre
				</CaseACocher>
			</form>
		{/key}
		{#if nature}
			<div class="zone-etat">
				<div class="boutons">
					<form method="post" action="?/activer" use:enhance={envoiEtat.soumettre}>
						<input type="hidden" name="id" value={nature.id} />
						<input type="hidden" name="actif" value={nature.actif ? '0' : '1'} />
						<Bouton variante="secondaire" type="submit" occupe={envoiEtat.occupe}>
							{nature.actif ? 'Désactiver' : 'Réactiver'}
						</Bouton>
					</form>
					{#if !nature.utilisee}
						<Bouton variante="discret" onclick={() => (confirmerSuppression = true)}
							>Supprimer</Bouton
						>
					{/if}
				</div>
				{#if nature.utilisee}
					<p class="t-caption t-muted">
						Cette Nature est utilisée : elle se désactive, mais ne se supprime pas.
					</p>
				{/if}
			</div>
		{/if}
	{/if}
	{#snippet pied()}
		{#if !systeme}
			<Bouton type="submit" form="form-nature" occupe={envoi.occupe}>Enregistrer</Bouton>
		{/if}
	{/snippet}
</Panneau>

<Dialogue
	ouvert={confirmerSuppression}
	titre="Supprimer {nature?.libelle} ?"
	libelleAction="Supprimer"
	danger
	confirmer={() => {}}
	revenir={() => (confirmerSuppression = false)}
>
	Cette Nature n’a jamais servi : elle disparaît de la liste.
	{#snippet actionPerso()}
		<form
			method="post"
			action="?/supprimer"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false, navigate: false });
					confirmerSuppression = false;
					if (result.type === 'success') fermer();
				}}
		>
			<input type="hidden" name="id" value={nature?.id} />
			<Bouton type="submit" variante="danger">Supprimer</Bouton>
		</form>
	{/snippet}
</Dialogue>

<style>
	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.zone-etat {
		display: grid;
		gap: var(--espace-2);
		margin-top: var(--espace-6);
		padding-top: var(--espace-4);
		border-top: 1px solid var(--border);
	}

	.boutons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
	}
</style>
