<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Layers, Plus } from '@lucide/svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import BoutonsOrdre from '#lib/ui/BoutonsOrdre.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const parametre = $derived(page.url.searchParams.get('groupe'));
	const nouveau = $derived(parametre === 'nouveau');
	const groupe = $derived(data.groupes.find((g) => String(g.id) === parametre) ?? null);
	const fermer = () => changerUrl({ groupe: null });
	const envoi = creerEnvoi({ apres: fermer });

	let confirmerSuppression = $state(false);

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
</script>

<EnTete
	titre="Groupes"
	aide={{ ancre: 'groupe', texte: 'Qu’est-ce qu’un Groupe ?' }}
	contexte="Réglages"
	sousTitre="Les blocs du Compte de résultat. Leur ordre est celui des états."
>
	{#snippet actions()}
		<span class="seulement-ordinateur">
			<Bouton href={urlAvec({ groupe: 'nouveau' })} conserverFocus>
				<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
				Créer un Groupe
			</Bouton>
		</span>
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

{#if data.groupes.length === 0}
	<EtatVide
		icone={Layers}
		titre="Pas encore de Groupe"
		phrase="Décrivez d’abord votre APE : les Groupes par défaut s’ajoutent alors d’eux-mêmes."
	/>
{:else}
	<Tableau legende="Groupes, dans l’ordre des états">
		<thead>
			<tr>
				<th scope="col">Groupe</th>
				<th scope="col" class="seulement-ordinateur"
					><span class="visuellement-cache">Ordre</span></th
				>
			</tr>
		</thead>
		<tbody>
			{#each data.groupes as g, i (g.id)}
				<tr>
					<td class="principale"
						><a href={urlAvec({ groupe: String(g.id) })} data-sveltekit-reset="false">{g.libelle}</a
						></td
					>
					<td class="seulement-ordinateur ordre">
						<BoutonsOrdre
							id={g.id}
							libelle={g.libelle}
							premier={i === 0}
							dernier={i === data.groupes.length - 1}
						/>
					</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<Panneau
	ouvert={nouveau || groupe !== null}
	titre={nouveau ? 'Nouveau Groupe' : (groupe?.libelle ?? '')}
	{fermer}
>
	{#key parametre}
		<form
			id="form-groupe"
			method="post"
			action={nouveau ? '?/creer' : '?/modifier'}
			class="pile"
			use:enhance={envoi.soumettre}
		>
			{#if groupe}<input type="hidden" name="id" value={groupe.id} />{/if}
			<Champ
				etiquette="Nom du Groupe"
				name="libelle"
				required
				valeur={saisie.libelle ?? groupe?.libelle ?? ''}
				erreur={erreurs.libelle}
			/>
		</form>
	{/key}
	{#if groupe}
		<div class="zone-etat">
			{#if groupe.utilise}
				<p class="t-caption t-muted">
					Ce Groupe porte des Natures ou des Actions : déplacez-les avant de le supprimer.
				</p>
			{:else}
				<div>
					<Bouton variante="discret" onclick={() => (confirmerSuppression = true)}>Supprimer</Bouton
					>
				</div>
			{/if}
		</div>
	{/if}
	{#snippet pied()}
		<Bouton type="submit" form="form-groupe" occupe={envoi.occupe}>Enregistrer</Bouton>
	{/snippet}
</Panneau>

<Dialogue
	ouvert={confirmerSuppression}
	titre="Supprimer {groupe?.libelle} ?"
	libelleAction="Supprimer"
	danger
	confirmer={() => {}}
	revenir={() => (confirmerSuppression = false)}
>
	Ce Groupe est vide : il disparaît de la liste.
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
			<input type="hidden" name="id" value={groupe?.id} />
			<Bouton type="submit" variante="danger">Supprimer</Bouton>
		</form>
	{/snippet}
</Dialogue>

<style>
	.ordre {
		text-align: right;
	}

	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.zone-etat {
		margin-top: var(--espace-6);
		padding-top: var(--espace-4);
		border-top: 1px solid var(--border);
	}
</style>
