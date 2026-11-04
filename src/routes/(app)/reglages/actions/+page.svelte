<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { CalendarRange, Plus } from '@lucide/svelte';
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

	const parametre = $derived(page.url.searchParams.get('action'));
	const nouveau = $derived(parametre === 'nouvelle');
	const element = $derived(data.liste.find((n) => String(n.id) === parametre) ?? null);
	const fermer = () => changerUrl({ action: null });
	const envoi = creerEnvoi({ apres: fermer });
	const envoiEtat = creerEnvoi({ apres: fermer });

	let confirmerSuppression = $state(false);

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const groupes = $derived(data.groupes.map((g) => ({ valeur: String(g.id), libelle: g.libelle })));
	const nomGroupe = (id: number) => data.groupes.find((g) => g.id === id)?.libelle ?? '—';
</script>

<EnTete
	titre="Actions"
	contexte="Réglages"
	sousTitre="Une Action, c’est une activité dont vous voulez connaître le résultat."
>
	{#snippet actions()}
		{#if data.liste.length > 0}
			<span class="seulement-ordinateur">
				<Bouton href={urlAvec({ action: 'nouvelle' })} conserverFocus>
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Créer une Action
				</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

{#if data.liste.length === 0}
	<EtatVide
		icone={CalendarRange}
		titre="Pas encore d’Action"
		phrase="Une Action, c’est une activité dont vous voulez connaître le résultat : Kermesse, Sortie, Agrumes…"
	>
		{#snippet action()}
			<span class="seulement-ordinateur">
				<Bouton href={urlAvec({ action: 'nouvelle' })} conserverFocus>Créer une Action</Bouton>
			</span>
		{/snippet}
	</EtatVide>
{:else}
	<Tableau legende="Actions">
		<thead>
			<tr>
				<th scope="col">Action</th>
				<th scope="col">Groupe</th>
				<th scope="col">État</th>
			</tr>
		</thead>
		<tbody>
			{#each data.liste as a (a.id)}
				<tr>
					<td class="principale">
						<a href={urlAvec({ action: String(a.id) })} data-sveltekit-reset="false">{a.libelle}</a>
					</td>
					<td>{nomGroupe(a.groupeId)}</td>
					<td class="t-caption t-muted">
						{#if a.avecCaisse}Avec caisse{/if}
						{#if !a.actif}Désactivée{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<Panneau
	ouvert={nouveau || element !== null}
	titre={nouveau ? 'Nouvelle Action' : (element?.libelle ?? '')}
	{fermer}
>
	{#key parametre}
		<form
			id="form-action"
			method="post"
			action={nouveau ? '?/creer' : '?/modifier'}
			class="pile"
			use:enhance={envoi.soumettre}
		>
			{#if element}<input type="hidden" name="id" value={element.id} />{/if}
			<Champ
				etiquette="Nom de l’Action"
				name="libelle"
				required
				valeur={saisie.libelle ?? element?.libelle ?? ''}
				erreur={erreurs.libelle}
			/>
			<ChampListe
				etiquette="Groupe"
				name="groupeId"
				options={groupes}
				valeur={saisie.groupeId ?? String(element?.groupeId ?? groupes[0]?.valeur ?? '')}
				erreur={erreurs.groupeId}
			/>
			<CaseACocher
				name="avecCaisse"
				coche={element?.avecCaisse ?? false}
				aide="L’Action est un évènement qui tient une ou plusieurs caisses."
			>
				Avec caisse
			</CaseACocher>
		</form>
	{/key}
	{#if element}
		<div class="zone-etat">
			<div class="boutons">
				<form method="post" action="?/activer" use:enhance={envoiEtat.soumettre}>
					<input type="hidden" name="id" value={element.id} />
					<input type="hidden" name="actif" value={element.actif ? '0' : '1'} />
					<Bouton variante="secondaire" type="submit" occupe={envoiEtat.occupe}>
						{element.actif ? 'Désactiver' : 'Réactiver'}
					</Bouton>
				</form>
				{#if !element.utilisee}
					<Bouton variante="discret" onclick={() => (confirmerSuppression = true)}>Supprimer</Bouton
					>
				{/if}
			</div>
			{#if element.utilisee}
				<p class="t-caption t-muted">
					Cette Action est utilisée : elle se désactive, mais ne se supprime pas.
				</p>
			{/if}
		</div>
	{/if}
	{#snippet pied()}
		<Bouton type="submit" form="form-action" occupe={envoi.occupe}>Enregistrer</Bouton>
	{/snippet}
</Panneau>

<Dialogue
	ouvert={confirmerSuppression}
	titre="Supprimer {element?.libelle} ?"
	libelleAction="Supprimer"
	danger
	confirmer={() => {}}
	revenir={() => (confirmerSuppression = false)}
>
	Cette Action n’a jamais servi : elle disparaît de la liste.
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
			<input type="hidden" name="id" value={element?.id} />
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
