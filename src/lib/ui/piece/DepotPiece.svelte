<script lang="ts">
	import { ACCEPTE_PIECE, type PieceDeposee } from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import DepotFichier from '#lib/ui/DepotFichier.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { deposerPiece } from './depot.ts';

	type Props = {
		operationId?: number | null;
		surDepose: (piece: PieceDeposee) => void;
		/** Un simple bouton, sur une rangée de liste. */
		compact?: boolean;
		libelleBouton?: string;
		nomCompact?: string;
		/** Reçoit un fichier collé : un seul dépôt visible à la fois doit l'accepter. */
		collage?: boolean;
		/** Pose l'erreur ailleurs, quand la zone est trop petite pour un bandeau. */
		surErreur?: (texte: string, reessayer: (() => void) | null) => void;
	};

	let {
		operationId = null,
		surDepose,
		compact = false,
		libelleBouton = 'Choisir un fichier',
		nomCompact,
		collage = false,
		surErreur
	}: Props = $props();

	let part = $state<number | null>(null);
	let erreur = $state<string | null>(null);
	let enEchec = $state<File | null>(null);

	function signaler(texte: string, fichier: File | null) {
		const reprendre = fichier ? () => envoyer(fichier) : null;
		if (surErreur) {
			surErreur(texte, reprendre);
			return;
		}
		erreur = texte;
		enEchec = fichier;
	}

	async function envoyer(fichier: File) {
		erreur = null;
		enEchec = null;
		part = 0;
		const r = await deposerPiece(fichier, {
			operationId,
			progres: (p) => (part = p)
		});
		part = null;
		if (r.type === 'ok') surDepose(r.valeur);
		else if (r.type === 'session') {
			demanderReconnexion();
			signaler(message('session_expiree'), fichier);
		} else if (r.type === 'refus') signaler(messageErreur(r.erreur), null);
		else if (r.type === 'reseau') signaler(message('reseau_coupe'), fichier);
		else signaler(message('erreur_serveur'), fichier);
	}

	async function deposer(fichiers: File[]) {
		for (const f of fichiers) await envoyer(f);
	}

	const pourcentage = $derived(part === null ? 0 : Math.round(part * 100));
</script>

{#if compact}
	<span class="compact" aria-label={nomCompact}>
		<DepotFichier
			{deposer}
			compact
			accepte={ACCEPTE_PIECE}
			{libelleBouton}
			occupe={part !== null}
		/>
	</span>
{:else}
	<div class="depot">
		<DepotFichier
			{deposer}
			{collage}
			serre
			discret
			photo
			accepte={ACCEPTE_PIECE}
			{libelleBouton}
			occupe={part !== null}
		>
			<p class="t-caption t-muted">Déposez, collez ou choisissez un PDF ou une photo.</p>
		</DepotFichier>
		{#if part !== null}
			<div
				class="progression"
				role="progressbar"
				aria-label="Envoi de la Pièce"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={pourcentage}
			>
				<span style:width="{pourcentage}%"></span>
			</div>
		{/if}
		{#if erreur}
			<Bandeau ton="erreur" alerte>
				{erreur}
				{#snippet action()}
					{#if enEchec}
						<Bouton variante="secondaire" onclick={() => enEchec && envoyer(enEchec)}>
							Réessayer
						</Bouton>
					{/if}
				{/snippet}
			</Bandeau>
		{/if}
	</div>
{/if}

<style>
	.depot {
		display: grid;
		gap: var(--espace-2);
	}

	.compact {
		display: inline-flex;
	}

	.progression {
		height: 4px;
		overflow: hidden;
		border-radius: var(--rayon-full);
		background: var(--surface-sunken);
	}

	.progression span {
		display: block;
		height: 100%;
		background: var(--primary);
		transition: width var(--mouvement-court, 120ms) linear;
	}
</style>
