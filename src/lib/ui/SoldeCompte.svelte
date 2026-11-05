<script lang="ts">
	import { enhance } from '$app/forms';
	import { formaterJourMois } from '#lib/domaine/dates.ts';
	import type { CarteCompte } from '#lib/domaine/etats/controle.ts';
	import { LIBELLES_TYPE_COMPTE } from '#lib/domaine/parametrage.ts';
	import { centimes, formaterMontant, formaterSaisie } from '#lib/domaine/montant.ts';
	import Bouton from './Bouton.svelte';
	import CalculPose from './CalculPose.svelte';
	import ChampMontant from './ChampMontant.svelte';
	import { creerEnvoi } from './envoi.svelte.ts';
	import Pastille, { type EtatPastille } from './Pastille.svelte';

	type Props = {
		carte: CarteCompte;
		/** Toute la carte mène au Pointage, si le rôle y a accès. */
		href?: string | null;
		/** Avant le jalon 2, une caisse se constate ici. Jour de ce constat. */
		constatDu?: string | null;
		/** Ce jour-là, l'étiquette dit « aujourd'hui » : ce n'est pas un Comptage enregistré. */
		aujourdhui?: string | null;
		erreur?: string;
	};
	let { carte, href = null, constatDu = null, aujourdhui = null, erreur }: Props = $props();

	const c = $derived(carte);
	const caisse = $derived(c.compte.type === 'caisse');
	const juste = $derived(c.etat === 'juste');
	const envoi = creerEnvoi();

	const lue = $derived(
		c.dateConstat === null
			? null
			: caisse
				? `compté le ${formaterJourMois(c.dateConstat)}`
				: `relevé du ${formaterJourMois(c.dateConstat)}`
	);

	/** Toujours une icône et un mot : l'état ne repose pas sur la barre de couleur. */
	const pastille = $derived.by((): { etat: EtatPastille; texte?: string } => {
		if (c.etat === 'ecart') return { etat: 'ecart' };
		if (c.etat === 'juste') {
			return { etat: 'pointe', texte: caisse ? 'Égal au comptage' : 'Égal au relevé' };
		}
		if (c.constate === null) {
			return { etat: 'a_regarder', texte: caisse ? 'Pas encore comptée' : 'Sans solde constaté' };
		}
		return { etat: 'a_regarder', texte: c.ancien ? 'Contrôle ancien' : 'À regarder' };
	});
</script>

<article class="solde-compte" class:juste class:lien={href}>
	<header>
		<div>
			<h2 class="t-heading">
				{#if href}<a {href}>{c.compte.libelle}</a>{:else}{c.compte.libelle}{/if}
			</h2>
			<p class="t-caption t-muted">{LIBELLES_TYPE_COMPTE[c.compte.type]}</p>
		</div>
		<Pastille {...pastille} />
	</header>
	<CalculPose
		termes={[
			{ libelle: 'Solde de départ', montant: c.depart },
			{
				libelle: 'Mouvements',
				montant: centimes(Math.abs(c.mouvements)),
				signe: c.mouvements < 0 ? '−' : '+'
			}
		]}
		totalLibelle="Solde calculé"
		total={c.calcule}
	/>
	{#if c.constate !== null}
		<div class="constate">
			<p>
				<span class="t-label">Solde constaté</span>
				<span class="t-caption t-muted">{lue}</span>
			</p>
			<p class="montant-lg">{formaterMontant(c.constate)}</p>
		</div>
	{/if}
	{#if c.phraseEcart}<p class="ecart t-label">{c.phraseEcart}</p>{/if}
	{#if constatDu !== null}
		<form method="post" action="?/constat" class="saisie" use:enhance={envoi.soumettre}>
			<input type="hidden" name="compteId" value={c.compte.id} />
			<input type="hidden" name="date" value={constatDu} />
			<ChampMontant
				etiquette={constatDu === aujourdhui
					? 'Solde compté aujourd’hui'
					: `Solde compté au ${formaterJourMois(constatDu)}`}
				name="solde"
				valeur={c.constate === null ? '' : formaterSaisie(c.constate)}
				{erreur}
				required
			/>
			<Bouton type="submit" variante="secondaire" occupe={envoi.occupe}>Enregistrer</Bouton>
		</form>
	{/if}
</article>

<style>
	.solde-compte {
		display: flex;
		flex-direction: column;
		gap: var(--espace-3);
		height: 100%;
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-left: 4px solid var(--warning);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.juste {
		border-left-color: var(--success);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--espace-1) var(--espace-2);
	}

	.constate {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--espace-3);
		padding-top: var(--espace-2);
		border-top: 1px solid var(--border);
	}

	.constate span {
		display: block;
	}

	.saisie {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--espace-2);
		margin-top: auto;
		/* Le lien de carte, absent ici : le champ reste atteignable. */
		position: relative;
	}

	.lien {
		position: relative;
	}

	.lien:hover {
		border-color: var(--border-strong);
		border-left-color: var(--warning);
	}

	.lien.juste:hover {
		border-left-color: var(--success);
	}

	.lien a {
		color: var(--ink);
		text-decoration: none;
	}

	/* Toute la carte reçoit le clic, le lien reste le seul élément focalisable. */
	.lien a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--rayon-lg);
	}
</style>
