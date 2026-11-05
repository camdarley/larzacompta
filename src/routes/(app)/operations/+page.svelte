<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Download,
		ListTree,
		Paperclip,
		Plus,
		Search,
		SlidersHorizontal,
		X
	} from '@lucide/svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { fonctionLivree } from '#lib/fonctions.ts';
	import { formaterMontant, formaterMontantSigne, lectureMontant } from '#lib/domaine/montant.ts';
	import type { RangeeOperation } from '#lib/domaine/operations/vues.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pagination from '#lib/ui/Pagination.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';

	let { data } = $props();

	const f = $derived(data.filtres);
	const r = $derived(data.resultats);
	const CRITERES = [
		'q',
		'du',
		'au',
		'montant',
		'compte',
		'nature',
		'action',
		'piece',
		'anciennes',
		'internes'
	] as const;

	const nom = (l: readonly { id: number; libelle: string }[], id: number | undefined) =>
		l.find((x) => x.id === id)?.libelle ?? '';

	const criteres = $derived(
		[
			f.texte && { nom: 'q', texte: `« ${f.texte} »` },
			f.du && { nom: 'du', texte: `Depuis le ${formaterDateCourte(f.du)}` },
			f.au && { nom: 'au', texte: `Jusqu’au ${formaterDateCourte(f.au)}` },
			f.montant && { nom: 'montant', texte: `Montant ${f.montant}` },
			f.compte && { nom: 'compte', texte: nom(data.comptes, f.compte) },
			f.nature && { nom: 'nature', texte: nom(data.natures, f.nature) },
			f.action && { nom: 'action', texte: nom(data.actions, f.action) },
			f.piece && { nom: 'piece', texte: f.piece === 'avec' ? 'Avec Pièce' : 'Sans Pièce' },
			f.anciennes && { nom: 'anciennes', texte: 'Anciennes, à pointer' },
			f.internes && { nom: 'internes', texte: 'Mouvements internes' }
		].filter((c) => !!c)
	);
	const filtre = $derived(criteres.length > 0);
	const compteur = $derived(
		r.total === 0 ? 'Aucune Opération' : `${r.total} Opération${r.total > 1 ? 's' : ''}`
	);

	const tousEffaces = $derived(
		urlAvec({ ...Object.fromEntries(CRITERES.map((c) => [c, null])), page: null })
	);
	const urlExport = $derived(
		`/operations/export${page.url.search.replace(/([?&])op=[^&]*&?/, '$1').replace(/[?&]$/, '')}`
	);

	function choisir(nom: string, valeur: string) {
		return changerUrl({ [nom]: valeur || null, page: null });
	}

	// La frappe filtre après une courte pause : l'URL reste la seule vérité.
	let attente: ReturnType<typeof setTimeout> | undefined;
	function surTexte(nom: string, valeur: string) {
		clearTimeout(attente);
		attente = setTimeout(
			() => goto(urlAvec({ [nom]: valeur || null, page: null }), { reset: false }),
			300
		);
	}

	const options = (l: readonly { id: number; libelle: string }[], tous: string) => [
		{ valeur: '', libelle: tous },
		...l.map((x) => ({ valeur: String(x.id), libelle: x.libelle }))
	];

	const montantLigne = (o: RangeeOperation) =>
		o.genre === 'interne' ? formaterMontant(o.montant) : formaterMontantSigne(o.montant);
	const panneauFiltres = $derived(page.url.searchParams.has('filtres'));

	/** Toute la rangée ouvre le panneau. Le focus part du lien : il y revient à la fermeture. */
	function ouvrir(e: MouseEvent, id: number) {
		const cible = e.target as HTMLElement;
		if (cible.closest('a, button')) return;
		const rangee = e.currentTarget as HTMLElement;
		rangee.querySelector<HTMLElement>('a')?.focus();
		changerUrl({ op: String(id) });
	}

	const lienOp = (id: number) => urlAvec({ op: String(id) });
</script>

{#snippet champsFiltres(prefixe: string)}
	<div class="date">
		<label class="t-label" for="{prefixe}-du">Du</label>
		<input
			id="{prefixe}-du"
			type="date"
			name="du"
			value={f.du ?? ''}
			onchange={(e) => choisir('du', e.currentTarget.value)}
		/>
	</div>
	<div class="date">
		<label class="t-label" for="{prefixe}-au">Au</label>
		<input
			id="{prefixe}-au"
			type="date"
			name="au"
			value={f.au ?? ''}
			onchange={(e) => choisir('au', e.currentTarget.value)}
		/>
	</div>
	<div class="date">
		<label class="t-label" for="{prefixe}-montant">Montant</label>
		<input
			id="{prefixe}-montant"
			type="text"
			inputmode="decimal"
			name="montant"
			autocomplete="off"
			value={f.montant}
			oninput={(e) => surTexte('montant', e.currentTarget.value)}
		/>
	</div>
	<ChampListe
		etiquette="Compte"
		id="{prefixe}-compte"
		name="compte"
		options={options(data.comptes, 'Tous')}
		valeur={f.compte ? String(f.compte) : ''}
		onchange={(v) => choisir('compte', v)}
	>
		{#snippet terme()}<AideTerme ancre="compte">Compte</AideTerme>{/snippet}
	</ChampListe>
	<ChampListe
		etiquette="Nature"
		id="{prefixe}-nature"
		name="nature"
		options={options(data.natures, 'Toutes')}
		valeur={f.nature ? String(f.nature) : ''}
		onchange={(v) => choisir('nature', v)}
	>
		{#snippet terme()}<AideTerme ancre="nature">Nature</AideTerme>{/snippet}
	</ChampListe>
	<ChampListe
		etiquette="Action"
		id="{prefixe}-action"
		name="action"
		options={options(data.actions, 'Toutes')}
		valeur={f.action ? String(f.action) : ''}
		onchange={(v) => choisir('action', v)}
	>
		{#snippet terme()}<AideTerme ancre="action">Action</AideTerme>{/snippet}
	</ChampListe>
	<ChampListe
		etiquette="Pièce"
		id="{prefixe}-piece"
		name="piece"
		options={[
			{ valeur: '', libelle: 'Avec ou sans' },
			{ valeur: 'avec', libelle: 'Avec Pièce' },
			{ valeur: 'sans', libelle: 'Sans Pièce' }
		]}
		valeur={f.piece ?? ''}
		onchange={(v) => choisir('piece', v)}
	>
		{#snippet terme()}<AideTerme ancre="piece">Pièce</AideTerme>{/snippet}
	</ChampListe>
{/snippet}

<EnTete
	titre="Opérations"
	sousTitre="Chaque fait financier, à retrouver en quelques secondes."
	aide={{ ancre: 'operation', texte: 'Qu’est-ce qu’une Opération ?' }}
>
	{#snippet actions()}
		{#if data.peutSaisir && data.exercice?.statut !== 'cloture'}
			<span class="seulement-telephone">
				<Bouton href={urlAvec({ op: 'nouvelle' })} conserverFocus>
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Nouvelle Opération
				</Bouton>
			</span>
		{/if}
		{#if r.total > 0}
			<Bouton variante="secondaire" href={urlExport} rechargement>
				<Download size={20} strokeWidth={1.75} aria-hidden="true" />
				Exporter en CSV
			</Bouton>
		{/if}
	{/snippet}
</EnTete>

{#if data.vide}
	<EtatVide
		icone={ListTree}
		titre="Pas encore d’Opération"
		phrase={fonctionLivree('pointage')
			? 'Saisissez-en une, ou partez de votre relevé : c’est plus rapide.'
			: 'Saisissez-en une : elle apparaîtra ici, prête à être retrouvée.'}
	>
		{#snippet action()}
			{#if data.peutSaisir}
				<Bouton href={urlAvec({ op: 'nouvelle' })} conserverFocus>Nouvelle Opération</Bouton>
				{#if fonctionLivree('pointage')}
					<Bouton variante="secondaire" href="/pointage">Importer un relevé</Bouton>
				{/if}
			{/if}
		{/snippet}
	</EtatVide>
{:else}
	<form class="filtres" method="get" aria-label="Filtres des Opérations">
		<div class="recherche">
			<label class="visuellement-cache" for="filtre-texte">Chercher une Opération</label>
			<Search size={20} strokeWidth={1.75} aria-hidden="true" />
			<input
				id="filtre-texte"
				type="search"
				name="q"
				autocomplete="off"
				placeholder="Libellé, référence, montant"
				value={f.texte}
				oninput={(e) => surTexte('q', e.currentTarget.value)}
			/>
		</div>
		<!-- Sans JavaScript aussi : les champs restent à un clic, la recherche suffit le plus souvent. -->
		<details class="plus seulement-ordinateur">
			<summary class="t-label">
				<SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
				Filtres{criteres.length > 0 ? ` (${criteres.length})` : ''}
			</summary>
			<div class="champs">{@render champsFiltres('filtre')}</div>
		</details>
		<div class="seulement-telephone bouton-filtres">
			<Bouton variante="secondaire" pleineLargeur href={urlAvec({ filtres: '1' })} conserverFocus>
				<SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
				Filtres{criteres.length > 0 ? ` (${criteres.length})` : ''}
			</Bouton>
		</div>
		<noscript><Bouton type="submit" variante="secondaire">Filtrer</Bouton></noscript>
		<div class="bilan">
			<p class="t-label" role="status" aria-live="polite">{compteur}</p>
			{#if filtre}
				<ul class="criteres">
					{#each criteres as c (c.nom)}
						<li>
							<a
								class="critere t-label"
								href={urlAvec({ [c.nom]: null, page: null })}
								aria-label="Retirer le filtre {c.texte}"
							>
								{c.texte}
								<X size={14} strokeWidth={2} aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
				<a class="t-label" href={tousEffaces}>Tout effacer</a>
			{/if}
		</div>
	</form>

	{#if r.total === 0}
		<EtatVide
			icone={Search}
			titre="Rien ne correspond"
			phrase="Essayez avec moins de critères. Un montant se cherche aussi dans les Lignes."
		>
			{#snippet action()}
				<Bouton variante="secondaire" href={tousEffaces}>Tout effacer</Bouton>
			{/snippet}
		</EtatVide>
	{:else}
		<Tableau legende="Opérations, de la plus récente à la plus ancienne">
			<thead>
				<tr>
					<th scope="col">Date</th>
					<th scope="col">Libellé</th>
					<th scope="col" class="compte">Compte</th>
					<th scope="col">Natures et Actions</th>
					<th scope="col"><span class="visuellement-cache">Pièces</span></th>
					<th scope="col">État</th>
					<th scope="col" class="droite">Montant</th>
				</tr>
			</thead>
			<tbody>
				{#each r.rangees as o (o.id)}
					<tr class="cliquable" class:annulee={o.annulee} onclick={(e) => ouvrir(e, o.id)}>
						<td class="date-cellule t-caption t-muted">{formaterDateCourte(o.date)}</td>
						<td class="principale">
							<a href={lienOp(o.id)} data-sveltekit-reset="false">{o.libelle}</a>
							{#if o.ligneTrouvee}
								<span class="trouvee t-caption t-muted">{o.ligneTrouvee}</span>
							{/if}
						</td>
						<td class="t-caption t-muted compte">{o.compte}</td>
						<td class="t-caption t-muted resume">
							<span class="natures-resume">{o.natures}</span>
							{#if o.actions}<span class="actions-resume">{o.actions}</span>{/if}
						</td>
						<td class="piece">
							{#if o.pieces > 0}
								<span class="icone-piece">
									<Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
									<span class="visuellement-cache">
										{o.pieces} Pièce{o.pieces > 1 ? 's' : ''}
									</span>
								</span>
							{:else}
								<span class="visuellement-cache">Sans Pièce</span>
							{/if}
						</td>
						<td class="etat">
							<span class="pastilles">
								{#if o.annulee}
									<span class="t-caption t-muted">Annulée</span>
								{:else}
									{#if o.cloture}<Pastille etat="cloture" />{/if}
									{#if o.etat === 'pointe'}<Pastille etat="pointe" />{/if}
									{#if o.etat === 'partiel'}<Pastille
											etat="a_pointer"
											texte="Pointé en partie"
										/>{/if}
									{#if o.etat === 'a_pointer'}<Pastille etat="a_pointer" />{/if}
									{#each o.rattachements as e (e)}
										<Pastille etat="rattachee" texte="Sur {e}" />
									{/each}
								{/if}
							</span>
						</td>
						<td class="montant">
							<span class="visuellement-cache">{lectureMontant(o.montant)}</span>
							<span aria-hidden="true">{montantLigne(o)}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</Tableau>
		<Pagination page={r.page} pages={r.pages} />
	{/if}
{/if}

<Panneau
	ouvert={panneauFiltres}
	sansConfirmation
	titre="Filtres"
	fermer={() => changerUrl({ filtres: null })}
>
	<div class="pile">{@render champsFiltres('filtre-panneau')}</div>
	{#snippet pied()}
		<Bouton variante="secondaire" onclick={() => changerUrl({ filtres: null })}>
			Voir {compteur}
		</Bouton>
	{/snippet}
</Panneau>

<style>
	.plus summary {
		position: absolute;
		top: var(--espace-3);
		right: var(--espace-3);
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-touch);
		padding: 0 var(--espace-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
		color: var(--ink);
		cursor: pointer;
		list-style: none;
	}

	.plus summary::-webkit-details-marker {
		display: none;
	}

	.plus summary:hover {
		background: var(--surface-sunken);
	}

	.plus .champs {
		margin-top: var(--espace-3);
	}

	.filtres {
		position: relative;
		display: grid;
		gap: var(--espace-3);
		margin: var(--espace-5) 0;
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.recherche {
		position: relative;
		display: flex;
		align-items: center;
	}

	.recherche :global(svg) {
		position: absolute;
		left: var(--espace-3);
		color: var(--ink-muted);
		pointer-events: none;
	}

	/* Le bouton Filtres se pose à droite de la recherche, sur la même rangée. */
	@media (min-width: 640px) {
		.recherche {
			margin-right: 9rem;
		}
	}

	.recherche input {
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-3) 0 calc(var(--espace-3) + 28px);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-body-taille);
	}

	.champs {
		display: grid;
		/* À 200 % de zoom, un champ de date ne se comprime pas : il passe à la ligne. */
		grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
		gap: var(--espace-3);
	}

	.date {
		display: grid;
		gap: var(--espace-1);
		min-width: 0;
	}

	.date input {
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--rayon-sm);
		background: var(--surface-raised);
		color: var(--ink);
		font-family: inherit;
		font-size: var(--typo-body-taille);
	}

	.bilan {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-2) var(--espace-3);
	}

	.criteres {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
	}

	.critere {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		padding: 2px var(--espace-2);
		border-radius: var(--rayon-full);
		background: var(--primary-soft);
		color: var(--primary);
		text-decoration: none;
	}

	.droite {
		text-align: right !important;
	}

	.cliquable {
		cursor: pointer;
	}

	.date-cellule {
		white-space: nowrap;
	}

	.principale a {
		color: var(--ink);
		font-weight: var(--typo-body-strong-graisse);
		text-decoration: none;
	}

	.principale a:hover {
		color: var(--primary);
		text-decoration: underline;
	}

	.annulee .principale a,
	.annulee .montant {
		color: var(--ink-muted);
		text-decoration: line-through;
	}

	.trouvee {
		display: block;
	}

	.piece {
		width: 1%;
		color: var(--ink-muted);
	}

	.icone-piece {
		display: inline-flex;
		vertical-align: middle;
	}

	.pastilles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
	}

	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.actions-resume {
		display: block;
	}

	@media (max-width: 1023.98px) {
		.compte {
			display: none;
		}
	}

	@media (max-width: 639.98px) {
		.compte {
			display: block;
		}

		.filtres {
			margin-top: var(--espace-4);
		}

		.date input,
		.recherche input {
			min-height: var(--espace-touch);
		}

		.etat:has(.pastilles:empty) {
			display: none;
		}

		.actions-resume {
			display: inline;
		}

		.natures-resume:has(+ .actions-resume)::after {
			content: ',';
		}
	}
</style>
