<script lang="ts">
	import { untrack } from 'svelte';
	import { formaterDateCourte } from '#lib/domaine/dates.ts';
	import { formaterMontantSigne } from '#lib/domaine/montant.ts';
	import { appliquerReglage, type ReglageCsv, type TableauCsv } from '#lib/domaine/releve/csv.ts';
	import { message } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';

	type Props = {
		nomFichier: string;
		tableau: TableauCsv;
		reglage: ReglageCsv;
		colonneAbsente: string | null;
		erreur: string | null;
		occupe: boolean;
		valider: (r: ReglageCsv) => void;
		fermer: () => void;
	};

	let { nomFichier, tableau, reglage, colonneAbsente, erreur, occupe, valider, fermer }: Props =
		$props();

	const APERCU = 5;
	const SANS = '';

	const depart = untrack(() => reglage);
	const dansFichier = (nom: string | undefined) =>
		nom !== undefined && tableau.entetes.includes(nom) ? nom : (tableau.entetes[0] ?? SANS);
	const montantDepart = depart.montant;

	let date = $state(dansFichier(depart.date));
	let libelle = $state(dansFichier(depart.libelle));
	let identifiant = $state(depart.identifiant ?? SANS);
	let mode = $state(montantDepart.mode);
	let colonne = $state(
		dansFichier(montantDepart.mode === 'unique' ? montantDepart.colonne : undefined)
	);
	let sorties = $state(
		dansFichier(montantDepart.mode === 'separees' ? montantDepart.sorties : undefined)
	);
	let entrees = $state(
		dansFichier(montantDepart.mode === 'separees' ? montantDepart.entrees : undefined)
	);

	const options = $derived(tableau.entetes.map((e) => ({ valeur: e, libelle: e })));
	const facultatives = $derived([{ valeur: SANS, libelle: 'Aucune' }, ...options]);

	const choisi = $derived<ReglageCsv>({
		date,
		libelle,
		identifiant: identifiant === SANS ? null : identifiant,
		montant:
			mode === 'unique' ? { mode: 'unique', colonne } : { mode: 'separees', sorties, entrees }
	});

	const apercu = $derived(appliquerReglage(tableau, choisi));
	const lignes = $derived(apercu.ok ? apercu.valeur.lignes.slice(0, APERCU) : []);
</script>

<Panneau ouvert titre="Colonnes de votre fichier" {fermer} sansConfirmation>
	<div class="correspondance">
		{#if erreur}<Bandeau ton="erreur" alerte>{erreur}</Bandeau>{/if}
		{#if colonneAbsente}
			<Bandeau ton="regarder" alerte>
				{message('format_change', { colonne: colonneAbsente })}
			</Bandeau>
		{/if}
		<p>
			Indiquez une fois les colonnes de <strong>{nomFichier}</strong>. Ce réglage est retenu pour ce
			Compte, et s’appliquera tout seul aux prochains fichiers.
		</p>

		<div class="deux">
			<ChampListe etiquette="Date" name="csv-date" {options} bind:valeur={date} />
			<ChampListe etiquette="Libellé" name="csv-libelle" {options} bind:valeur={libelle} />
		</div>

		<fieldset>
			<legend class="t-label">Montant</legend>
			<div class="choix" role="group" aria-label="Forme du montant">
				<button type="button" aria-pressed={mode === 'unique'} onclick={() => (mode = 'unique')}>
					Une colonne Montant
				</button>
				<button
					type="button"
					aria-pressed={mode === 'separees'}
					onclick={() => (mode = 'separees')}
				>
					Deux colonnes, Sorties et Entrées
				</button>
			</div>
			{#if mode === 'unique'}
				<ChampListe
					etiquette="Colonne du montant"
					name="csv-montant"
					{options}
					bind:valeur={colonne}
				/>
			{:else}
				<div class="deux">
					<ChampListe etiquette="Sorties" name="csv-sorties" {options} bind:valeur={sorties} />
					<ChampListe etiquette="Entrées" name="csv-entrees" {options} bind:valeur={entrees} />
				</div>
			{/if}
		</fieldset>

		<ChampListe
			etiquette="Identifiant de ligne"
			name="csv-identifiant"
			options={facultatives}
			bind:valeur={identifiant}
			aide="Facultatif. S’il existe, il évite de relire deux fois une même ligne."
		/>

		<section aria-labelledby="apercu-titre">
			<h3 id="apercu-titre" class="t-heading">Aperçu des lignes lues</h3>
			{#if lignes.length === 0}
				<Bandeau ton="regarder">
					Ces colonnes ne se lisent pas encore. Vérifiez la date et le montant.
				</Bandeau>
			{:else}
				<ul class="apercu">
					{#each lignes as l, i (i)}
						<li>
							<span class="date t-caption">{formaterDateCourte(l.date)}</span>
							<span class="libelle">{l.libelle}</span>
							<span class="montant">{formaterMontantSigne(l.montant)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	{#snippet pied()}
		<Bouton {occupe} onclick={() => valider(choisi)}>Importer ces lignes</Bouton>
		<Bouton variante="discret" onclick={fermer}>Laisser ce fichier</Bouton>
	{/snippet}
</Panneau>

<style>
	.correspondance {
		display: grid;
		gap: var(--espace-4);
	}

	.deux {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--espace-3);
	}

	fieldset {
		display: grid;
		gap: var(--espace-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.choix {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
		padding: var(--espace-1);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.choix button {
		flex: 1 1 auto;
		min-height: 40px;
		padding: 0 var(--espace-3);
		border: 1px solid transparent;
		border-radius: var(--rayon-sm);
		background: transparent;
		color: var(--ink-muted);
		font: inherit;
		font-weight: var(--typo-label-graisse);
		cursor: pointer;
	}

	.choix button[aria-pressed='true'] {
		border-color: var(--border-strong);
		background: var(--surface-raised);
		color: var(--primary);
	}

	section {
		display: grid;
		gap: var(--espace-2);
	}

	.apercu li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--espace-3);
		padding: var(--espace-2) 0;
		border-top: 1px solid var(--border);
	}

	.date {
		color: var(--ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.libelle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
