<script lang="ts">
	import { formaterJourMois } from '#lib/domaine/dates.ts';
	import type { CarteCompte } from '#lib/domaine/etats/controle.ts';
	import { LIBELLES_TYPE_COMPTE } from '#lib/domaine/parametrage.ts';
	import { centimes, formaterMontant } from '#lib/domaine/montant.ts';
	import CalculPose from './CalculPose.svelte';
	import Pastille, { type EtatPastille } from './Pastille.svelte';

	type Props = {
		carte: CarteCompte;
		/** Toute la carte mène au Pointage ou au détail de caisse, si le rôle y a accès. */
		href?: string | null;
	};
	let { carte, href = null }: Props = $props();

	const c = $derived(carte);
	const caisse = $derived(c.compte.type === 'caisse');
	/** Chèques à remettre : solde seul. Il n'y a rien à constater, Q3 tient lieu de contrôle. */
	const cheques = $derived(c.compte.type === 'cheques_a_remettre');
	const juste = $derived(c.etat === 'juste');

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
		if (c.sessionOuverte) return { etat: 'a_regarder', texte: 'Session ouverte' };
		if (c.etat === 'juste') {
			return { etat: 'pointe', texte: caisse ? 'Égal au comptage' : 'Égal au relevé' };
		}
		if (c.constate === null) {
			return { etat: 'a_regarder', texte: caisse ? 'Pas encore comptée' : 'Sans solde constaté' };
		}
		return { etat: 'a_regarder', texte: c.ancien ? 'Contrôle ancien' : 'À regarder' };
	});
</script>

<article
	class="solde-compte"
	class:juste={juste && !cheques}
	class:neutre={cheques}
	class:lien={href}
>
	<header>
		<div>
			<h2 class="t-heading">
				{#if href}<a {href}>{c.compte.libelle}</a>{:else}{c.compte.libelle}{/if}
			</h2>
			{#if !cheques}
				<p class="t-caption t-muted">{LIBELLES_TYPE_COMPTE[c.compte.type]}</p>
			{/if}
		</div>
		{#if !cheques}<Pastille {...pastille} />{/if}
	</header>
	{#if cheques}
		<p class="montant-lg solde-seul">{formaterMontant(c.calcule)}</p>
		<p class="t-caption t-muted">Reçus, pas encore déposés en banque.</p>
	{:else}
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
	{/if}
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
</article>

<style>
	.solde-seul {
		text-align: left;
	}

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

	/* Rien à regarder ici : la barre ne dit ni juste, ni à vérifier. */
	.neutre {
		border-left-color: var(--border-strong);
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
