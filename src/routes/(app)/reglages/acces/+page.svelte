<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Check, Copy, Plus } from '@lucide/svelte';
	import { formaterHorodatage } from '#lib/domaine/dates.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const LIBELLES_ROLE = { tresorier: 'Trésorerie', lecteur: 'Lecture', compteur: 'Comptage' };

	const ouvert = $derived(page.url.searchParams.get('acces') === 'nouveau');
	const fermer = () => changerUrl({ acces: null });
	const envoi = creerEnvoi({ toast: false });

	let aRevoquer = $state<{ id: number; nomAffiche: string } | null>(null);
	let copie = $state(false);

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const lien = $derived(form?.lien);
	const roles = $derived(data.roles.map((r) => ({ valeur: r, libelle: LIBELLES_ROLE[r] })));

	async function copier() {
		await navigator.clipboard.writeText(lien ?? '');
		copie = true;
	}
</script>

<EnTete
	titre="Accès"
	contexte="Réglages"
	sousTitre="Chaque personne a son Accès. Pour transmettre la trésorerie, créez-en un : aucun mot de passe ne se partage."
>
	{#snippet actions()}
		<span class="seulement-ordinateur">
			<Bouton href={urlAvec({ acces: 'nouveau' })} conserverFocus>
				<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
				Créer un Accès
			</Bouton>
		</span>
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

<Tableau legende="Accès à l’instance">
	<thead>
		<tr>
			<th scope="col">Personne</th>
			<th scope="col">Identifiant</th>
			<th scope="col">Rôle</th>
			<th scope="col">Dernier accès</th>
			<th scope="col" class="seulement-ordinateur"
				><span class="visuellement-cache">Actions</span></th
			>
		</tr>
	</thead>
	<tbody>
		{#each data.liste as a (a.id)}
			<tr>
				<td class="principale">{a.nomAffiche}</td>
				<td>{a.identifiant}</td>
				<td>{LIBELLES_ROLE[a.role]}</td>
				<td class="t-caption t-muted">
					{#if a.revoqueLe}Révoqué{:else if a.enAttente}En attente du mot de passe{:else if a.dernierAccesLe}{formaterHorodatage(
							a.dernierAccesLe
						)}{:else}Jamais{/if}
				</td>
				<td class="seulement-ordinateur droite">
					{#if !a.revoqueLe && a.id !== data.moi}
						<Bouton variante="discret" onclick={() => (aRevoquer = a)}>Révoquer</Bouton>
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</Tableau>

<Panneau {ouvert} titre="Nouvel Accès" {fermer}>
	{#if lien}
		<div class="pile">
			<Bandeau ton="regarder"
				>Ce lien ne s’affichera qu’une seule fois. Il reste valable 7 jours.</Bandeau
			>
			<p>Transmettez-le à {form?.nom} : la personne y choisira son mot de passe.</p>
			<code class="lien">{lien}</code>
			<div>
				<Bouton variante="secondaire" onclick={copier}>
					{#if copie}
						<Check size={20} strokeWidth={1.75} aria-hidden="true" />
						Copié
					{:else}
						<Copy size={20} strokeWidth={1.75} aria-hidden="true" />
						Copier le lien
					{/if}
				</Bouton>
			</div>
		</div>
	{:else}
		<form id="form-acces" method="post" action="?/creer" class="pile" use:enhance={envoi.soumettre}>
			<Champ
				etiquette="Identifiant"
				name="identifiant"
				required
				autocomplete="off"
				aide="Celui que la personne tapera pour se connecter."
				valeur={saisie.identifiant ?? ''}
				erreur={erreurs.identifiant}
			/>
			<Champ
				etiquette="Nom affiché"
				name="nomAffiche"
				required
				autocomplete="off"
				valeur={saisie.nomAffiche ?? ''}
				erreur={erreurs.nomAffiche}
			/>
			{#if roles.length > 1}
				<ChampListe
					etiquette="Rôle"
					name="role"
					options={roles}
					valeur={saisie.role ?? roles[0]?.valeur}
				/>
			{:else}
				<input type="hidden" name="role" value={roles[0]?.valeur} />
			{/if}
		</form>
	{/if}
	{#snippet pied()}
		{#if lien}
			<Bouton onclick={fermer}>Fermer</Bouton>
		{:else}
			<Bouton type="submit" form="form-acces" occupe={envoi.occupe}>Créer l’Accès</Bouton>
		{/if}
	{/snippet}
</Panneau>

<Dialogue
	ouvert={aRevoquer !== null}
	titre="Révoquer l’Accès de {aRevoquer?.nomAffiche} ?"
	libelleAction="Révoquer"
	danger
	confirmer={() => {}}
	revenir={() => (aRevoquer = null)}
>
	Ses sessions et ses liens s’arrêtent tout de suite. Son nom reste dans le Journal.
	{#snippet actionPerso()}
		<form
			method="post"
			action="?/revoquer"
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false, navigate: false });
					aRevoquer = null;
				}}
		>
			<input type="hidden" name="id" value={aRevoquer?.id} />
			<Bouton type="submit" variante="danger">Révoquer</Bouton>
		</form>
	{/snippet}
</Dialogue>

<style>
	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.lien {
		display: block;
		padding: var(--espace-3);
		border-radius: var(--rayon-sm);
		background: var(--surface-sunken);
		font-family: var(--typo-key-famille);
		font-size: var(--typo-caption-taille);
		overflow-wrap: anywhere;
	}

	.droite {
		text-align: right;
	}
</style>
