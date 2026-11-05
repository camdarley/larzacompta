<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { History, SlidersHorizontal, X } from '@lucide/svelte';
	import { formaterDateCourte, formaterHorodatage } from '#lib/domaine/dates.ts';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pagination from '#lib/ui/Pagination.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';

	let { data } = $props();

	const LIBELLES_ENTITE: Record<string, string> = {
		acces: 'Accès',
		action: 'Action',
		association: 'Association',
		compte: 'Compte',
		exercice: 'Exercice',
		groupe: 'Groupe',
		nature: 'Nature',
		operation: 'Opération',
		pointage: 'Pointage',
		import_releve: 'Relevé',
		ligne_releve: 'Ligne de relevé',
		constat_solde: 'Solde du relevé',
		piece: 'Pièce',
		creance_dette: 'Créance ou Dette'
	};
	/** Ce que toute personne qui lit le Journal peut aussi ouvrir. */
	const CHEMINS_CONSULTATION: Record<string, (id: number) => string> = {
		operation: (id) => urlAvec({ op: String(id) }),
		piece: (id) => `/pieces/toutes?piece=${id}`,
		creance_dette: (id) => `/creances-dettes#somme-${id}`
	};
	const CHEMINS: Record<string, (id: number) => string> = {
		acces: () => '/reglages/acces',
		action: (id) => `/reglages/actions?action=${id}`,
		association: () => '/reglages',
		compte: (id) => `/reglages/comptes?compte=${id}`,
		exercice: () => '/reglages/exercices',
		groupe: (id) => `/reglages/groupes?groupe=${id}`,
		nature: (id) => `/reglages/natures?nature=${id}`,
		pointage: () => '/pointage',
		import_releve: () => '/pointage',
		ligne_releve: () => '/pointage',
		constat_solde: () => '/pointage'
	};

	const j = $derived(data.journal);
	const f = $derived(data.filtres);
	const nomType = (t: string) => LIBELLES_ENTITE[t] ?? t;

	const personnes = $derived([
		{ valeur: '', libelle: 'Toutes' },
		...j.personnes.map((p) => ({ valeur: p, libelle: p }))
	]);
	const types = $derived([
		{ valeur: '', libelle: 'Tous' },
		...j.types.map((t) => ({ valeur: t, libelle: nomType(t) }))
	]);

	const criteres = $derived(
		[
			f.personne && { nom: 'personne', texte: f.personne },
			f.type && { nom: 'type', texte: nomType(f.type) },
			f.du && { nom: 'du', texte: `Depuis le ${formaterDateCourte(f.du)}` },
			f.au && { nom: 'au', texte: `Jusqu’au ${formaterDateCourte(f.au)}` }
		].filter((c) => !!c)
	);
	const filtre = $derived(criteres.length > 0);

	const compteur = $derived(
		j.total === 0 ? 'Aucun résultat' : `${j.total} résultat${j.total > 1 ? 's' : ''}`
	);

	function choisir(nom: string, valeur: string) {
		return goto(urlAvec({ [nom]: valeur || null, page: null }), { reset: false });
	}

	function lienDe(e: { entiteType: string; entiteId: number | null }) {
		if (e.entiteId === null) return null;
		const chemin =
			CHEMINS_CONSULTATION[e.entiteType] ??
			(data.liensReglages ? CHEMINS[e.entiteType] : undefined);
		return chemin?.(e.entiteId) ?? null;
	}

	/** Toute la rangée mène à l'élément, au doigt comme à la souris. Le lien reste pour le clavier. */
	function ouvrir(ev: MouseEvent, href: string | null) {
		if (href === null || (ev.target as HTMLElement).closest('a, button')) return;
		goto(href);
	}

	const panneauFiltres = $derived(page.url.searchParams.has('filtres'));
</script>

{#snippet champsFiltres(prefixe: string)}
	<ChampListe
		id="{prefixe}-personne"
		etiquette="Personne"
		name="personne"
		options={personnes}
		valeur={f.personne ?? ''}
		onchange={(v) => choisir('personne', v)}
	/>
	<ChampListe
		id="{prefixe}-type"
		etiquette="Type"
		name="type"
		options={types}
		valeur={f.type ?? ''}
		onchange={(v) => choisir('type', v)}
	/>
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
{/snippet}

<EnTete titre="Journal" sousTitre="Qui a fait quoi, et quand. Personne ne peut le modifier." />

{#if j.total === 0 && !filtre}
	<EtatVide
		icone={History}
		titre="Rien pour l’instant"
		phrase="Chaque modification sera notée ici."
	/>
{:else}
	<form class="filtres" method="get" aria-label="Filtres du Journal">
		<div class="champs seulement-ordinateur">{@render champsFiltres('filtre')}</div>
		<div class="seulement-telephone">
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
				<a class="t-label" href="/journal">Tout effacer</a>
			{/if}
		</div>
	</form>

	{#if j.total > 0}
		<Tableau legende="Modifications, de la plus récente à la plus ancienne">
			<thead>
				<tr>
					<th scope="col">Date</th>
					<th scope="col">Personne</th>
					<th scope="col">Action</th>
					<th scope="col">Élément</th>
				</tr>
			</thead>
			<tbody>
				{#each j.entrees as e (e.id)}
					{@const href = lienDe(e)}
					<tr class:cliquable={href} onclick={(ev) => ouvrir(ev, href)}>
						<td class="date-cellule t-caption t-muted">{formaterHorodatage(e.horodatage)}</td>
						<td class="personne">{e.accesNom}</td>
						<td class="principale">{e.resume}</td>
						<td class="element">
							{#if href}
								<a {href} data-sveltekit-reset="false">{nomType(e.entiteType)}</a>
							{:else}
								{nomType(e.entiteType)}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</Tableau>
		<Pagination page={j.page} pages={j.pages} />
	{:else}
		<EtatVide icone={History} titre="Rien ne correspond" phrase="Essayez avec moins de critères." />
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
			Voir {compteur.toLocaleLowerCase('fr')}
		</Bouton>
	{/snippet}
</Panneau>

<style>
	.cliquable {
		cursor: pointer;
	}

	.pile {
		display: grid;
		gap: var(--espace-3);
	}

	.filtres {
		display: grid;
		gap: var(--espace-3);
		margin: var(--espace-5) 0;
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.champs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--espace-3);
	}

	.date {
		display: grid;
		gap: var(--espace-1);
	}

	.date input {
		width: 100%;
		min-height: var(--espace-row);
		padding: 0 var(--espace-3);
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

	.date-cellule {
		white-space: nowrap;
	}
</style>
