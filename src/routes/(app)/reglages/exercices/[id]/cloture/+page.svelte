<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		CircleCheck,
		FileExclamationPoint,
		Landmark,
		Paperclip,
		ReceiptText,
		TriangleAlert
	} from '@lucide/svelte';
	import { formaterHorodatage } from '#lib/domaine/dates.ts';
	import { centimes, formaterMontant, sommeCentimes } from '#lib/domaine/montant.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { creerEnvoi } from '#lib/ui/envoi.svelte.ts';
	import TuileAFaire from '#lib/ui/TuileAFaire.svelte';

	let { data, form } = $props();

	const e = $derived(data.exercice);
	const q = $derived(`?exercice=${encodeURIComponent(e.libelle)}`);
	const totalEcart = $derived(
		sommeCentimes(data.ecarts.map((c) => centimes(Math.abs(c.ecart as number))))
	);
	const piecesTexte = $derived(
		data.pieces === 1 ? '1 Pièce manquante' : `${data.pieces} Pièces manquantes`
	);
	const recalcul = $derived(
		data.suivant ? `Les soldes de départ de ${data.suivant.libelle} seront recalculés.` : ''
	);

	let confirmer = $state(false);
	const envoi = creerEnvoi({ toast: false, apres: () => (confirmer = false) });
</script>

<EnTete titre="Clôture de {e.libelle}" contexte="Réglages" />

{#if e.statut === 'cloture'}
	<section class="fin" aria-labelledby="titre-fin">
		<CircleCheck size={32} strokeWidth={1.75} aria-hidden="true" />
		<div>
			<h2 id="titre-fin" class="t-title">{e.libelle} est clôturé.</h2>
			<p>
				Ses états ne bougent plus.
				{#if data.cloture}Clôturé le {formaterHorodatage(data.cloture.le)}.{/if}
			</p>
			<div class="actions">
				<Bouton href="/etats/document-ag{q}">Voir le Document d’AG</Bouton>
				{#if data.suivant === null}
					<Bouton variante="secondaire" href="/reglages/exercices">Ouvrir l’Exercice suivant</Bouton
					>
				{:else}
					<Bouton
						variante="secondaire"
						href="/?exercice={encodeURIComponent(data.suivant.libelle)}"
					>
						Revenir à {data.suivant.libelle}
					</Bouton>
				{/if}
			</div>
		</div>
	</section>
{:else}
	<p class="intro">
		Rien de ce qui suit n’empêche de clôturer. Regardez, corrigez ce qui peut l’être, puis
		verrouillez l’année : une correction passera ensuite par une nouvelle Opération dans un Exercice
		ouvert.
	</p>

	{#if data.refus}
		<Bandeau ton="regarder" alerte>{data.refus}</Bandeau>
	{/if}
	{#if form?.erreur}
		<Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau>
	{/if}

	<section class="liste" aria-labelledby="titre-verif">
		<h2 id="titre-verif" class="t-heading">Ce qui reste</h2>
		<ul>
			<li>
				<TuileAFaire
					libelle="Écarts"
					compteur={data.ecarts.length}
					icone={TriangleAlert}
					href="/{q}"
				/>
			</li>
			<li>
				<TuileAFaire
					libelle="Lignes de relevé non pointées"
					compteur={data.lignes}
					icone={Landmark}
					href="/pointage{q}"
				/>
			</li>
			<li>
				<TuileAFaire
					libelle="Pièces manquantes"
					compteur={data.pieces}
					icone={Paperclip}
					href="/pieces{q}"
				/>
			</li>
			<li>
				<TuileAFaire
					libelle="Dettes sans Pièce"
					compteur={data.dettes}
					icone={FileExclamationPoint}
					href="/creances-dettes{q}"
				/>
			</li>
			<li>
				<TuileAFaire
					libelle="Chèques reçus à remettre"
					compteur={data.cheques}
					icone={ReceiptText}
					href="/cheques?etat=en_attente"
				/>
			</li>
		</ul>
		{#each data.ecarts as c (c.compte.id)}
			<p class="t-label ecart">{c.compte.libelle} : {c.phraseEcart}</p>
		{/each}
	</section>

	{#if data.refus === null}
		<div class="seulement-ordinateur">
			<Bouton onclick={() => (confirmer = true)}>Clôturer {e.libelle}</Bouton>
		</div>
	{/if}

	<Dialogue
		ouvert={confirmer}
		titre="Clôturer {e.libelle}"
		libelleAction="Clôturer {e.libelle}"
		danger
		confirmer={() => {}}
		revenir={() => (confirmer = false)}
	>
		<p>
			Les états seront figés. {recalcul} Reste : {piecesTexte}, Écart {formaterMontant(totalEcart)}.
		</p>
		{#snippet actionPerso()}
			<form method="post" action="?/cloturer" use:enhance={envoi.soumettre}>
				<input type="hidden" name="exerciceId" value={e.id} />
				<Bouton type="submit" variante="danger" occupe={envoi.occupe}>Clôturer {e.libelle}</Bouton>
			</form>
		{/snippet}
	</Dialogue>
{/if}

<style>
	.intro {
		max-width: var(--espace-reading-max);
	}

	.liste {
		display: grid;
		gap: var(--espace-2);
		max-width: var(--espace-reading-max);
	}

	.liste ul {
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
		overflow: hidden;
	}

	.liste li + li {
		border-top: 1px solid var(--border);
	}

	.fin {
		display: flex;
		align-items: flex-start;
		gap: var(--espace-3);
		max-width: var(--espace-reading-max);
		padding: var(--espace-5);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.fin > :global(svg) {
		flex: none;
		color: var(--success);
	}

	.fin p {
		margin-top: var(--espace-1);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
		margin-top: var(--espace-4);
	}
</style>
