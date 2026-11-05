<script lang="ts">
	import { goto } from '$app/navigation';
	import { History, X } from '@lucide/svelte';
	import { formaterDateCourte, formaterHorodatage } from '#lib/domaine/dates.ts';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import Pagination from '#lib/ui/Pagination.svelte';
	import Tableau from '#lib/ui/Tableau.svelte';
	import { urlAvec } from '#lib/ui/url.ts';
	import Bouton from '#lib/ui/Bouton.svelte';

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
		constat_solde: 'Solde du relevé'
	};
	const CHEMINS: Record<string, (id: number) => string> = {
		acces: () => '/reglages/acces',
		action: (id) => `/reglages/actions?action=${id}`,
		association: () => '/reglages',
		compte: (id) => `/reglages/comptes?compte=${id}`,
		exercice: () => '/reglages/exercices',
		groupe: (id) => `/reglages/groupes?groupe=${id}`,
		nature: (id) => `/reglages/natures?nature=${id}`
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
</script>

<EnTete titre="Journal" sousTitre="Qui a fait quoi, et quand. Personne ne peut le modifier." />

{#if j.total === 0 && !filtre}
	<EtatVide
		icone={History}
		titre="Rien pour l’instant"
		phrase="Chaque modification sera notée ici."
	/>
{:else}
	<form class="filtres" method="get" aria-label="Filtres du Journal">
		<div class="champs">
			<ChampListe
				etiquette="Personne"
				name="personne"
				options={personnes}
				valeur={f.personne ?? ''}
				onchange={(v) => choisir('personne', v)}
			/>
			<ChampListe
				etiquette="Type"
				name="type"
				options={types}
				valeur={f.type ?? ''}
				onchange={(v) => choisir('type', v)}
			/>
			<div class="date">
				<label class="t-label" for="filtre-du">Du</label>
				<input
					id="filtre-du"
					type="date"
					name="du"
					value={f.du ?? ''}
					onchange={(e) => choisir('du', e.currentTarget.value)}
				/>
			</div>
			<div class="date">
				<label class="t-label" for="filtre-au">Au</label>
				<input
					id="filtre-au"
					type="date"
					name="au"
					value={f.au ?? ''}
					onchange={(e) => choisir('au', e.currentTarget.value)}
				/>
			</div>
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
					<tr>
						<td class="date-cellule t-caption t-muted">{formaterHorodatage(e.horodatage)}</td>
						<td class="personne">{e.accesNom}</td>
						<td class="principale">{e.resume}</td>
						<td class="element">
							{#if data.liensReglages && e.entiteId !== null && CHEMINS[e.entiteType]}
								<a href={CHEMINS[e.entiteType]?.(e.entiteId)}>{nomType(e.entiteType)}</a>
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

<style>
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
