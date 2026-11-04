<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Landmark, Plus } from '@lucide/svelte';
	import { formaterMontant, formaterSaisie } from '#lib/domaine/montant.ts';
	import { LIBELLES_TYPE_COMPTE } from '#lib/domaine/parametrage.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import BoutonsOrdre from '#lib/ui/BoutonsOrdre.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data, form } = $props();

	const parametre = $derived(page.url.searchParams.get('compte'));
	const nouveau = $derived(parametre === 'nouveau');
	const compte = $derived(data.comptes.find((c) => String(c.id) === parametre) ?? null);
	const ouvert = $derived(nouveau || compte !== null);
	const fermer = () => changerUrl({ compte: null });
	const envoi = creerEnvoi({ apres: fermer });
	const envoiEtat = creerEnvoi({ apres: fermer });

	let confirmerSuppression = $state(false);

	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});
	const types = [
		{ valeur: 'banque', libelle: LIBELLES_TYPE_COMPTE.banque },
		{ valeur: 'epargne', libelle: LIBELLES_TYPE_COMPTE.epargne },
		{ valeur: 'caisse', libelle: LIBELLES_TYPE_COMPTE.caisse }
	];
	const optionsExercice = $derived(
		data.ouverts.map((e) => ({ valeur: String(e.id), libelle: `Début de ${e.libelle}` }))
	);
	const exerciceDe = $derived(
		compte?.ancre ? String(compte.ancre.exerciceId) : String(data.ouverts[0]?.id ?? '')
	);
	const soldeModifiable = $derived(
		compte?.ancre
			? data.ouverts.some((e) => e.id === compte?.ancre?.exerciceId)
			: data.ouverts.length > 0
	);
</script>

<EnTete
	titre="Comptes"
	contexte="Réglages"
	sousTitre="Les lieux où se trouve votre trésorerie : banque, livret, caisses."
>
	{#snippet actions()}
		{#if data.comptes.length > 0}
			<span class="seulement-ordinateur">
				<Bouton href={urlAvec({ compte: 'nouveau' })} conserverFocus>
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Créer un Compte
				</Bouton>
			</span>
		{/if}
	{/snippet}
</EnTete>

{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
	<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
{/if}

{#if data.comptes.length === 0}
	<EtatVide
		icone={Landmark}
		titre="Pas encore de Compte"
		phrase="Créez un Compte pour votre banque, votre livret et chaque caisse."
	>
		{#snippet action()}
			<span class="seulement-ordinateur">
				<Bouton href={urlAvec({ compte: 'nouveau' })} conserverFocus>Créer un Compte</Bouton>
			</span>
		{/snippet}
	</EtatVide>
{:else}
	<Tableau legende="Comptes de l’APE">
		<thead>
			<tr>
				<th scope="col">Compte</th>
				<th scope="col">Type</th>
				<th scope="col" class="droite">Solde de départ</th>
				<th scope="col">État</th>
				<th scope="col" class="seulement-ordinateur"
					><span class="visuellement-cache">Ordre</span></th
				>
			</tr>
		</thead>
		<tbody>
			{#each data.comptes as c, i (c.id)}
				<tr>
					<td class="principale">
						<a href={urlAvec({ compte: String(c.id) })} data-sveltekit-reset="false">{c.libelle}</a>
					</td>
					<td>{LIBELLES_TYPE_COMPTE[c.type]}</td>
					<td class="montant">{c.ancre ? formaterMontant(c.ancre.solde) : '—'}</td>
					<td class="t-caption t-muted">{c.actif ? 'Actif' : 'Désactivé'}</td>
					<td class="seulement-ordinateur">
						<BoutonsOrdre
							id={c.id}
							libelle={c.libelle}
							premier={i === 0}
							dernier={i === data.comptes.length - 1}
						/>
					</td>
				</tr>
			{/each}
		</tbody>
	</Tableau>
{/if}

<Panneau {ouvert} titre={nouveau ? 'Nouveau Compte' : (compte?.libelle ?? '')} {fermer}>
	{#key parametre}
		<form
			id="form-compte"
			method="post"
			action={nouveau ? '?/creer' : '?/modifier'}
			class="pile"
			use:enhance={envoi.soumettre}
		>
			{#if compte}<input type="hidden" name="id" value={compte.id} />{/if}
			<Champ
				etiquette="Nom du Compte"
				name="libelle"
				required
				valeur={saisie.libelle ?? compte?.libelle ?? ''}
				erreur={erreurs.libelle}
			/>
			{#if compte?.utilise}
				<input type="hidden" name="type" value={compte.type} />
				<Champ
					etiquette="Type"
					name="type-lecture"
					lectureSeule
					valeur={LIBELLES_TYPE_COMPTE[compte.type]}
					aide="Le type d’un Compte utilisé ne change plus."
				/>
			{:else}
				<ChampListe
					etiquette="Type"
					name="type"
					options={types}
					valeur={saisie.type ?? compte?.type ?? 'banque'}
					erreur={erreurs.type}
				/>
			{/if}
			{#if soldeModifiable}
				{#if !compte?.ancre}
					<ChampListe
						etiquette="Solde de départ posé au"
						name="exerciceId"
						options={optionsExercice}
						valeur={exerciceDe}
					/>
				{:else}
					<input type="hidden" name="exerciceId" value={exerciceDe} />
				{/if}
				<ChampMontant
					etiquette="Solde de départ"
					name="soldeDepart"
					valeur={saisie.soldeDepart ?? (compte?.ancre ? formaterSaisie(compte.ancre.solde) : '')}
					erreur={erreurs.soldeDepart}
					aide="Vide, le Compte part de 0,00 €."
				/>
			{/if}
		</form>
	{/key}
	{#if compte}
		<div class="zone-etat">
			{#if compte.actif}
				<p class="t-caption t-muted">
					Un Compte désactivé n’est plus proposé, mais reste affiché sur l’existant.
				</p>
			{/if}
			<div class="boutons">
				<form method="post" action="?/activer" use:enhance={envoiEtat.soumettre}>
					<input type="hidden" name="id" value={compte.id} />
					<input type="hidden" name="actif" value={compte.actif ? '0' : '1'} />
					<Bouton variante="secondaire" type="submit" occupe={envoiEtat.occupe}>
						{compte.actif ? 'Désactiver' : 'Réactiver'}
					</Bouton>
				</form>
				{#if !compte.utilise}
					<Bouton variante="discret" onclick={() => (confirmerSuppression = true)}>Supprimer</Bouton
					>
				{/if}
			</div>
		</div>
	{/if}
	{#snippet pied()}
		<Bouton type="submit" form="form-compte" occupe={envoi.occupe}>Enregistrer</Bouton>
	{/snippet}
</Panneau>

<Dialogue
	ouvert={confirmerSuppression}
	titre="Supprimer {compte?.libelle} ?"
	libelleAction="Supprimer"
	danger
	confirmer={() => {}}
	revenir={() => (confirmerSuppression = false)}
>
	Ce Compte n’a jamais servi : il disparaît de la liste. Le Journal garde la trace de sa
	suppression.
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
			<input type="hidden" name="id" value={compte?.id} />
			<Bouton type="submit" variante="danger">Supprimer</Bouton>
		</form>
	{/snippet}
</Dialogue>

<style>
	.droite {
		text-align: right;
	}

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
