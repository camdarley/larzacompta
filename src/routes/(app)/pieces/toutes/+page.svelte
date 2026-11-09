<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { FileSearch, Files, Hourglass, Link2Off, Plus } from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontant, formaterMontantSigne, type Centimes } from '#lib/domaine/montant.ts';
	import { ACCEPTE_PIECE } from '#lib/domaine/pieces/index.ts';
	import { message, messageErreur } from '#lib/messages.ts';
	import { demander, envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pagination from '#lib/ui/Pagination.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import ApercuPiece from '#lib/ui/piece/ApercuPiece.svelte';
	import { deposerPiece } from '#lib/ui/piece/depot.ts';
	import EntetePieces from '#lib/ui/piece/EntetePieces.svelte';
	import VisionneusePiece from '#lib/ui/piece/VisionneusePiece.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';
	import DepotFichier from '#lib/ui/DepotFichier.svelte';

	let { data } = $props();

	const piece = $derived(data.choisie);
	const fermer = () => changerUrl({ piece: null });

	let erreur = $state<string | null>(null);
	let autreId = $state<number | null>(null);
	let occupe = $state(false);
	let confirmer = $state(false);

	const filtre = $derived(data.filtres.q || data.filtres.type || data.filtres.etat);

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

	function choisir(nom: 'q' | 'type' | 'etat', valeur: string) {
		const url = urlAvec({ [nom]: valeur || null, page: null, piece: null });
		goto(url, { replaceState: true, reset: false });
	}

	let attente: ReturnType<typeof setTimeout> | undefined;
	function surTexte(valeur: string) {
		clearTimeout(attente);
		attente = setTimeout(() => choisir('q', valeur), 200);
	}

	const effacer = () => goto(urlAvec({ q: null, type: null, etat: null, page: null, piece: null }));

	async function chercher(texte: string): Promise<OptionRecherche[]> {
		const r = await demander<{ id: number; libelle: string; date: string; montant: Centimes }[]>(
			`/api/operations/candidats?q=${encodeURIComponent(texte)}`
		);
		if (r.type !== 'ok') return [];
		return r.valeur.map((o) => ({
			id: o.id,
			libelle: o.libelle,
			detail: `${formaterDateCourte(o.date)}, ${formaterMontant(o.montant)}`
		}));
	}

	async function rattacher() {
		if (piece === null || occupe) return;
		if (autreId === null) {
			erreur = 'Choisissez l’Opération à rattacher.';
			return;
		}
		const pieceId = piece.id;
		const operationId = autreId;
		occupe = true;
		const r = await envoyer(`/api/pieces/${pieceId}/rattacher`, { operationId });
		occupe = false;
		if (!suivre(r)) return;
		autreId = null;
		afficherToast('Pièce rattachée.', {
			libelle: 'Annuler',
			faire: () => void detacher(pieceId, operationId, false)
		});
		await refreshAll();
	}

	async function detacher(pieceId: number, operationId: number, annulable = true) {
		if (!suivre(await envoyer(`/api/pieces/${pieceId}/detacher`, { operationId }))) return;
		if (annulable) {
			afficherToast('Pièce retirée.', {
				libelle: 'Annuler',
				faire: async () => {
					suivre(await envoyer(`/api/pieces/${pieceId}/rattacher`, { operationId }));
					await refreshAll();
				}
			});
		}
		await refreshAll();
	}

	async function supprimer() {
		if (piece === null) return;
		const r = await envoyer(`/api/pieces/${piece.id}/supprimer`);
		confirmer = false;
		if (!suivre(r)) return;
		afficherToast('Pièce supprimée.');
		await fermer();
		await refreshAll();
	}

	/** Une Pièce déposée ici attend son rattachement, comme une photo prise sur place. */
	async function deposer(fichiers: File[]) {
		for (const f of fichiers) {
			if (suivre(await deposerPiece(f)))
				afficherToast('Pièce ajoutée. Elle attend son rattachement.');
		}
		await refreshAll();
	}

	const titre = $derived(piece?.nomOriginal ?? '');
	const q = $derived(page.url.searchParams.get('q') ?? '');
</script>

<EntetePieces manquantes={data.manquantes} toutes={data.resultat.existantes} />

{#if erreur && !piece}
	<div class="alerte"><Bandeau ton="erreur" alerte>{erreur}</Bandeau></div>
{/if}

{#if data.resultat.existantes === 0}
	<EtatVide
		icone={Files}
		titre="Pas encore de Pièce"
		phrase="Joignez-en une à une Opération, ou déposez-la ici : elle attendra son rattachement."
	>
		{#snippet action()}
			{#if data.peutSaisir}
				<DepotFichier
					{deposer}
					accepte={ACCEPTE_PIECE}
					compact
					libelleBouton="Choisir un fichier"
				/>
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<div class="filtres" role="search" aria-label="Filtres des Pièces">
		<Champ
			etiquette="Rechercher"
			name="q"
			type="search"
			valeur={q}
			oninput={surTexte}
			placeholder="Nom du fichier ou Opération"
		/>
		<ChampListe
			etiquette="Type"
			name="type"
			valeur={data.filtres.type}
			options={[
				{ valeur: '', libelle: 'Tous' },
				{ valeur: 'image', libelle: 'Photos et images' },
				{ valeur: 'pdf', libelle: 'PDF' }
			]}
			onchange={(v) => choisir('type', v)}
		/>
		<ChampListe
			etiquette="État"
			name="etat"
			valeur={data.filtres.etat}
			options={[
				{ valeur: '', libelle: 'Tous' },
				{ valeur: 'en_attente', libelle: 'En attente de rattachement' },
				{ valeur: 'rattachee', libelle: 'Rattachées' }
			]}
			onchange={(v) => choisir('etat', v)}
		/>
		{#if filtre}
			<div class="effacer"><Bouton variante="discret" onclick={effacer}>Tout effacer</Bouton></div>
		{/if}
	</div>

	<p class="compteur t-caption t-muted" role="status">
		{data.resultat.total}
		{data.resultat.total > 1 ? 'Pièces' : 'Pièce'}
	</p>

	{#if data.resultat.total === 0}
		<EtatVide
			icone={FileSearch}
			titre="Rien ne correspond"
			phrase="Essayez avec moins de critères."
		/>
	{:else}
		<ul class="grille">
			{#each data.resultat.pieces as p (p.id)}
				{@const op = p.operations[0]}
				<li>
					<ApercuPiece piece={p} grand href={urlAvec({ piece: String(p.id) })} />
					<p class="nom t-label">{p.nomOriginal}</p>
					{#if op}
						<p class="t-caption t-muted lien-op">
							{op.libelle}{#if p.operations.length > 1}, et {p.operations.length - 1} autre{p
									.operations.length > 2
									? 's'
									: ''}{/if}
						</p>
					{:else if p.sommes[0]}
						<p class="t-caption t-muted lien-op">
							{p.sommes[0].sens === 'dette' ? 'Dette' : 'Créance'} : {p.sommes[0].tiers}
						</p>
					{:else}
						<p class="t-caption attente">
							<Hourglass size={16} strokeWidth={1.75} aria-hidden="true" />
							À rattacher
						</p>
					{/if}
				</li>
			{/each}
		</ul>
		<Pagination page={data.resultat.page} pages={data.resultat.pages} />
	{/if}
{/if}

<Panneau ouvert={piece !== null} {titre} {fermer} sansConfirmation lecture>
	{#if piece}
		{#if erreur}<div class="alerte"><Bandeau ton="erreur" alerte>{erreur}</Bandeau></div>{/if}
		<VisionneusePiece {piece} />

		<section class="operations" aria-label="Opérations justifiées">
			<h3 class="t-heading">Justifie</h3>
			{#if piece.sommes.length > 0}
				<ul>
					{#each piece.sommes as c (c.id)}
						<li>
							<span>{c.sens === 'dette' ? 'Dette' : 'Créance'} : {c.tiers}, {c.motif}</span>
							{#if c.annulee}<span class="t-caption t-muted">annulée</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if piece.operations.length === 0}
				<p class="t-muted">
					{piece.sommes.length > 0
						? 'Aucune Opération pour l’instant : elle sera jointe au paiement de la somme.'
						: 'Aucune Opération pour l’instant : cette Pièce attend son rattachement.'}
				</p>
			{:else}
				<ul>
					{#each piece.operations as o (o.id)}
						<li>
							<a href="/operations?op={o.id}">{o.libelle}</a>
							<span class="t-caption t-muted">{formaterDateCourte(o.date)}</span>
							<span class="montant">{formaterMontantSigne(o.montant)}</span>
							{#if data.peutSaisir}
								<button
									class="retirer"
									type="button"
									aria-label="Retirer de {o.libelle}"
									onclick={() => piece && detacher(piece.id, o.id)}
								>
									<Link2Off size={20} strokeWidth={1.75} aria-hidden="true" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.peutSaisir}
				<div class="rattacher">
					<SelecteurRecherche
						etiquette="Rattacher à une Opération"
						id="piece-operation"
						options={[]}
						bind:valeur={autreId}
						{chercher}
						placeholder="Libellé, référence ou montant"
					/>
					<Bouton variante="secondaire" {occupe} onclick={rattacher}>
						<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
						Rattacher
					</Bouton>
				</div>
				{#if piece.operations.length === 0 && piece.sommes.length === 0}
					<div>
						<Bouton variante="discret" onclick={() => (confirmer = true)}
							>Supprimer cette Pièce</Bouton
						>
					</div>
				{/if}
			{/if}
		</section>
	{/if}
</Panneau>

<Dialogue
	ouvert={confirmer}
	titre="Supprimer cette Pièce ?"
	libelleAction="Supprimer"
	danger
	confirmer={supprimer}
	revenir={() => (confirmer = false)}
>
	« {piece?.nomOriginal} » ne justifie aucune Opération. Elle disparaît de la liste, et le Journal garde
	la trace de sa suppression.
</Dialogue>

<style>
	.alerte {
		margin-bottom: var(--espace-4);
	}

	.filtres {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
		gap: var(--espace-3);
		align-items: end;
	}

	.effacer {
		padding-bottom: 2px;
	}

	.compteur {
		margin: var(--espace-3) 0;
	}

	.grille {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: var(--espace-4);
	}

	.grille li {
		display: grid;
		align-content: start;
		gap: var(--espace-1);
		min-width: 0;
	}

	.nom,
	.lien-op {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.attente {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		color: var(--warning-text, var(--ink-muted));
	}

	.operations {
		display: grid;
		gap: var(--espace-2);
		margin-top: var(--espace-5);
		padding-top: var(--espace-4);
		border-top: 1px solid var(--border);
	}

	.operations li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: var(--espace-3);
		min-height: var(--espace-row);
	}

	.operations li + li {
		border-top: 1px solid var(--border);
	}

	.retirer {
		display: inline-grid;
		place-items: center;
		width: var(--espace-row);
		height: var(--espace-row);
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

	.rattacher {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--espace-2);
		align-items: end;
	}

	@media (max-width: 639.98px) {
		.filtres {
			grid-template-columns: minmax(0, 1fr);
		}

		.grille {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--espace-3);
		}

		.rattacher {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
