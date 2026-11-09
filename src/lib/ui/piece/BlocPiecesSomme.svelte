<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { X } from '@lucide/svelte';
	import type { PieceJ } from '#lib/domaine/journal.ts';
	import type { PieceDeposee } from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import ApercuPiece from './ApercuPiece.svelte';
	import DepotPiece from './DepotPiece.svelte';
	import VisionneusePiece from './VisionneusePiece.svelte';

	type Props = {
		/** Somme existante : chaque geste s'enregistre aussitôt. Nulle : la somme est en saisie. */
		creanceId: number | null;
		pieces?: PieceJ[];
		/** Somme en saisie : les Pièces partent avec elle. */
		enSaisie?: PieceDeposee[];
		actif: boolean;
	};

	let { creanceId, pieces = [], enSaisie = $bindable([]), actif }: Props = $props();

	let ouverte = $state<Pick<PieceJ, 'sha256' | 'nomOriginal' | 'mime'> | null>(null);
	let erreur = $state<string | null>(null);

	const aide =
		'La facture reçue, la notification. Elle sera jointe aussi à l’Opération qui solde la somme.';

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
		if (creanceId === null) return;
		const id = creanceId;
		if (!suivre(await envoyer(`/api/pieces/${pieceId}/detacher`, { creanceId: id }))) return;
		afficherToast('Pièce retirée.', {
			libelle: 'Annuler',
			faire: async () => {
				suivre(await envoyer(`/api/pieces/${pieceId}/rattacher`, { creanceId: id }));
				await refreshAll();
			}
		});
		await refreshAll();
	}

	function surDepose(p: PieceDeposee) {
		erreur = null;
		if (creanceId === null) {
			if (!enSaisie.some((x) => x.id === p.id)) enSaisie = [...enSaisie, p];
			return;
		}
		afficherToast(p.connue ? 'Pièce déjà connue, jointe à cette somme.' : 'Pièce jointe.', {
			libelle: 'Annuler',
			faire: () => void detacher(p.id)
		});
		refreshAll();
	}

	/** Un dépôt retiré avant d'enregistrer ne doit pas attendre dans Pièces, s'il vient d'ici. */
	async function retirerEnSaisie(p: PieceDeposee) {
		enSaisie = enSaisie.filter((x) => x.id !== p.id);
		if (!p.connue) await envoyer(`/api/pieces/${p.id}/supprimer`);
	}
</script>

{#snippet rangee(p: Pick<PieceJ, 'sha256' | 'nomOriginal' | 'mime'>, retirer: (() => void) | null)}
	<li>
		<ApercuPiece piece={p} ouvrir={() => (ouverte = p)} />
		<p class="nom">{p.nomOriginal}</p>
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
				{@render rangee(p, actif ? () => detacher(p.id) : null)}
			{/each}
			{#each enSaisie as p (p.id)}
				{@render rangee(p, () => retirerEnSaisie(p))}
			{/each}
		</ul>
	{:else if !actif}
		<p class="t-muted">Aucune Pièce.</p>
	{/if}

	{#if actif}
		<p class="t-caption t-muted">{aide}</p>
		<DepotPiece {creanceId} {surDepose} collage />
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

	.nom {
		flex: 1;
		min-width: 0;
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
