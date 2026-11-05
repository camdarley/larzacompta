<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { X } from '@lucide/svelte';
	import type { DetailOperation } from '#lib/domaine/operations/vues.ts';
	import {
		phraseAutres,
		phraseAutresOperations,
		type PieceDeposee
	} from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import CaseACocher from '#lib/ui/CaseACocher.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import ApercuPiece from './ApercuPiece.svelte';
	import DepotPiece from './DepotPiece.svelte';
	import VisionneusePiece from './VisionneusePiece.svelte';

	type PieceEnSaisie = PieceDeposee;

	type Props = {
		/** Opération existante : chaque geste s'enregistre aussitôt, même sur un Exercice clôturé. */
		detail: DetailOperation | null;
		peutSaisir: boolean;
		/** Saisie nouvelle : les Pièces partent avec l'Opération. */
		enSaisie?: PieceEnSaisie[];
		sansPiece?: boolean;
		/** La case ne concerne qu'une dépense (FR-27). */
		estDepense: boolean;
		surChangement?: () => void;
	};

	let {
		detail,
		peutSaisir,
		enSaisie = $bindable([]),
		sansPiece = $bindable(false),
		estDepense,
		surChangement
	}: Props = $props();

	const operationId = $derived(detail?.operation.id ?? null);
	const pieces = $derived(detail?.pieces ?? []);
	const actif = $derived(peutSaisir && !detail?.annulee);

	let ouverte = $state<Pick<PieceDeposee, 'sha256' | 'nomOriginal' | 'mime'> | null>(null);
	let erreur = $state<string | null>(null);
	// La case d'une Opération existante suit ce qui est enregistré, sauf pendant le geste.
	let coche = $derived(detail?.operation.sansPiece ?? false);

	function suivre(r: Awaited<ReturnType<typeof envoyer>>): boolean {
		if (r.type === 'ok') {
			erreur = null;
			return true;
		}
		if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'refus') erreur = messageErreur(r.erreur);
		else erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		return false;
	}

	async function detacher(pieceId: number) {
		if (operationId === null) return;
		const id = operationId;
		if (!suivre(await envoyer(`/api/pieces/${pieceId}/detacher`, { operationId: id }))) return;
		afficherToast('Pièce retirée.', {
			libelle: 'Annuler',
			faire: async () => {
				suivre(await envoyer(`/api/pieces/${pieceId}/rattacher`, { operationId: id }));
				await refreshAll();
			}
		});
		await refreshAll();
	}

	function surDepose(p: PieceDeposee) {
		erreur = null;
		if (operationId === null) {
			if (!enSaisie.some((x) => x.id === p.id)) enSaisie = [...enSaisie, p];
			surChangement?.();
			return;
		}
		afficherToast(p.connue ? 'Pièce déjà connue, jointe à cette Opération.' : 'Pièce jointe.', {
			libelle: 'Annuler',
			faire: () => void detacher(p.id)
		});
		refreshAll();
	}

	/** Un dépôt retiré avant d'enregistrer ne doit pas attendre dans Pièces, s'il vient d'ici. */
	async function retirerEnSaisie(p: PieceEnSaisie) {
		enSaisie = enSaisie.filter((x) => x.id !== p.id);
		if (!p.connue) await envoyer(`/api/pieces/${p.id}/supprimer`);
	}

	async function changerDispense(valeur: boolean) {
		if (detail === null) return;
		const r = await envoyer(`/api/operations/${detail.operation.id}/sans-piece`, {
			sansPiece: valeur
		});
		if (!suivre(r)) {
			coche = !valeur;
			return;
		}
		await refreshAll();
	}
</script>

{#snippet rangee(
	p: { id: number; sha256: string; nomOriginal: string; mime: string },
	autre: string | null,
	retirer: (() => void) | null
)}
	<li>
		<ApercuPiece piece={p} ouvrir={() => (ouverte = p)} />
		<div class="texte">
			<p class="nom">{p.nomOriginal}</p>
			{#if autre}
				<a class="t-caption" href="/pieces/toutes?piece={p.id}">{autre}</a>
			{/if}
		</div>
		{#if retirer}
			<button class="retirer" type="button" aria-label="Retirer {p.nomOriginal}" onclick={retirer}>
				<X size={20} strokeWidth={1.75} aria-hidden="true" />
			</button>
		{/if}
	</li>
{/snippet}

<section class="bloc" aria-label="Pièce">
	<h3 class="t-heading"><AideTerme ancre="piece">Pièce</AideTerme></h3>
	{#if erreur}<Bandeau ton="erreur" alerte>{erreur}</Bandeau>{/if}

	{#if pieces.length > 0 || enSaisie.length > 0}
		<ul class="pieces">
			{#each pieces as p (p.id)}
				{@render rangee(
					p,
					phraseAutresOperations(p, operationId),
					actif ? () => detacher(p.id) : null
				)}
			{/each}
			{#each enSaisie as p (p.id)}
				{@render rangee(p, phraseAutres(p.autresOperations), () => retirerEnSaisie(p))}
			{/each}
		</ul>
	{:else if !actif}
		<p class="t-muted">Aucune Pièce.</p>
	{/if}

	{#if actif}
		{#if !(detail ? coche : sansPiece)}
			<DepotPiece {operationId} {surDepose} collage />
		{/if}
		{#if estDepense && pieces.length === 0 && enSaisie.length === 0}
			{#if detail}
				<CaseACocher
					name="sans-piece"
					id="op-sans-piece"
					bind:coche
					surChangement={changerDispense}
					aide="Frais bancaires par exemple : elle ne sera pas réclamée."
				>
					Pas besoin de Pièce
				</CaseACocher>
			{:else}
				<CaseACocher
					name="sans-piece"
					id="op-sans-piece"
					bind:coche={sansPiece}
					aide="Frais bancaires par exemple : elle ne sera pas réclamée."
				>
					Pas besoin de Pièce
				</CaseACocher>
			{/if}
		{/if}
	{:else if detail?.operation.sansPiece}
		<p class="t-muted">Pas besoin de Pièce.</p>
	{/if}
</section>

{#if ouverte}
	<VisionneusePiece piece={ouverte} revenir={() => (ouverte = null)} />
{/if}

<style>
	.bloc {
		display: grid;
		gap: var(--espace-2);
	}

	h3 :global(button) {
		font: inherit;
	}

	.pieces li {
		display: flex;
		align-items: center;
		gap: var(--espace-3);
		padding: var(--espace-2) 0;
	}

	.pieces li + li {
		border-top: 1px solid var(--border);
	}

	.texte {
		flex: 1;
		min-width: 0;
	}

	.nom {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.retirer {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--espace-touch);
		height: var(--espace-touch);
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.retirer:hover {
		background: var(--surface-sunken);
		color: var(--ink);
	}
</style>
