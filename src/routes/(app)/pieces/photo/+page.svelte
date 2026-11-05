<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { Camera, Check, Upload } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant } from '#lib/domaine/montant.ts';
	import {
		ACCEPTE_PIECE,
		type DepenseSansPiece,
		type PieceDeposee
	} from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import ApercuPiece from '#lib/ui/piece/ApercuPiece.svelte';
	import { deposerPiece } from '#lib/ui/piece/depot.ts';
	import { photoAttendue } from '#lib/ui/piece/photo-attente.svelte.ts';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';

	let { data } = $props();

	let appareil = $state<HTMLInputElement | null>(null);
	let fichierChoisi = $state<HTMLInputElement | null>(null);

	let part = $state<number | null>(null);
	let piece = $state<PieceDeposee | null>(null);
	let erreur = $state<string | null>(null);
	let enEchec = $state<File | null>(null);
	let occupe = $state(false);

	const pourcentage = $derived(Math.round((part ?? 0) * 100));

	async function envoyerPhoto(fichier: File) {
		erreur = null;
		enEchec = null;
		piece = null;
		part = 0;
		const r = await deposerPiece(fichier, { progres: (p) => (part = p) });
		part = null;
		if (r.type === 'ok') {
			piece = r.valeur;
			return;
		}
		if (r.type === 'refus') {
			erreur = messageErreur(r.erreur);
			return;
		}
		enEchec = fichier;
		if (r.type === 'session') {
			demanderReconnexion();
			erreur = message('session_expiree');
		} else {
			erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
		}
	}

	// Le cliché pris depuis `barre-mobile` arrive ici.
	$effect(() => {
		const f = photoAttendue.fichier;
		if (f) {
			photoAttendue.fichier = null;
			envoyerPhoto(f);
		}
	});

	function surChoix(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) envoyerPhoto(f);
	}

	async function ranger(d: DepenseSansPiece) {
		if (piece === null || occupe) return;
		const pieceId = piece.id;
		occupe = true;
		const r = await envoyer(`/api/pieces/${pieceId}/rattacher`, { operationId: d.id });
		occupe = false;
		if (r.type === 'ok') {
			piece = null;
			afficherToast(`Rangée avec « ${d.libelle} ».`, {
				libelle: 'Annuler',
				faire: async () => {
					await envoyer(`/api/pieces/${pieceId}/detacher`, { operationId: d.id });
					await refreshAll();
				}
			});
			await refreshAll();
		} else if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'refus') erreur = messageErreur(r.erreur);
		else erreur = message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur');
	}

	function plusTard() {
		piece = null;
		afficherToast('La Pièce attend dans Pièces, onglet Toutes.');
	}
</script>

<EnTete titre="Photo d’une Pièce" sansTitre />

<div class="photo">
	<h1 class="t-title" tabindex="-1">
		{piece ? 'Avec quelle dépense la ranger ?' : 'Photo d’une Pièce'}
	</h1>

	{#if erreur}
		<Bandeau ton="erreur" alerte>
			{erreur}
			{#snippet action()}
				{#if enEchec}
					<Bouton variante="secondaire" onclick={() => enEchec && envoyerPhoto(enEchec)}>
						Réessayer
					</Bouton>
				{/if}
			{/snippet}
		</Bandeau>
	{/if}

	{#if part !== null}
		<div class="envoi" role="status">
			<p>Envoi de la photo…</p>
			<div
				class="progression"
				role="progressbar"
				aria-label="Envoi de la photo"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={pourcentage}
			>
				<span style:width="{pourcentage}%"></span>
			</div>
		</div>
	{:else if piece}
		<div class="prise">
			<ApercuPiece {piece} />
			<p class="confirmation">
				<Check size={20} strokeWidth={1.75} aria-hidden="true" />
				La photo est enregistrée.
			</p>
		</div>
		{#if data.recentes.length > 0}
			<ul class="depenses" aria-label="Dépenses récentes sans Pièce">
				{#each data.recentes as d (d.id)}
					<li>
						<button type="button" disabled={occupe} onclick={() => ranger(d)}>
							<span class="libelle">{d.libelle}</span>
							<span class="t-caption t-muted date">{formaterDateCourte(d.date)}</span>
							<span class="montant">{formaterMontant(d.montant)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="t-muted">Aucune dépense récente n’attend de Pièce.</p>
		{/if}
		<Bouton variante="secondaire" pleineLargeur onclick={plusTard}>Rattacher plus tard</Bouton>
	{:else}
		<p class="t-muted">Prenez le ticket en photo : il est rangé avant d’être perdu.</p>
		<input
			bind:this={appareil}
			hidden
			type="file"
			accept="image/*"
			capture="environment"
			onchange={surChoix}
		/>
		<input
			bind:this={fichierChoisi}
			hidden
			type="file"
			accept={ACCEPTE_PIECE}
			onchange={surChoix}
		/>
		<Bouton pleineLargeur onclick={() => appareil?.click()}>
			<Camera size={20} strokeWidth={1.75} aria-hidden="true" />
			Prendre une photo
		</Bouton>
		<Bouton variante="secondaire" pleineLargeur onclick={() => fichierChoisi?.click()}>
			<Upload size={20} strokeWidth={1.75} aria-hidden="true" />
			Choisir un fichier
		</Bouton>
	{/if}
</div>

<style>
	.photo {
		display: grid;
		gap: var(--espace-3);
		max-width: var(--espace-reading-max);
		margin: 0 auto;
	}

	.photo :global(.bouton) {
		min-height: var(--espace-touch);
	}

	.prise {
		display: flex;
		align-items: center;
		gap: var(--espace-3);
	}

	.confirmation {
		display: flex;
		align-items: center;
		gap: var(--espace-2);
		color: var(--success);
		font-weight: var(--typo-label-graisse);
	}

	.envoi {
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-5) 0;
	}

	.progression {
		height: 8px;
		overflow: hidden;
		border-radius: var(--rayon-full);
		background: var(--surface-sunken);
	}

	.progression span {
		display: block;
		height: 100%;
		background: var(--primary);
	}

	.depenses {
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.depenses li + li {
		border-top: 1px solid var(--border);
	}

	.depenses button {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0 var(--espace-3);
		width: 100%;
		min-height: var(--espace-touch-large);
		align-content: center;
		padding: var(--espace-2) var(--espace-3);
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.depenses button:hover {
		background: var(--surface-sunken);
	}

	.libelle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.date {
		grid-row: 2;
	}

	.montant {
		grid-row: 1 / span 2;
		grid-column: 2;
		align-self: center;
	}
</style>
