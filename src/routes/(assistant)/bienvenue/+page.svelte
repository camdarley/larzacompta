<script lang="ts">
	import { enhance } from '$app/forms';
	import { CheckCheck, Plus, Trash2 } from '@lucide/svelte';
	import { ETAPES_ASSISTANT } from '#lib/domaine/assistant.ts';
	import { capitaliser, formaterDateLongue, nomDuMois } from '#lib/domaine/dates.ts';
	import { bornesExercice, libelleExercice } from '#lib/domaine/exercices.ts';
	import { formaterSaisie } from '#lib/domaine/montant.ts';
	import { LIBELLES_TYPE_COMPTE } from '#lib/domaine/parametrage.ts';
	import { TEXTES } from '#lib/messages.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CaseACocher from '#lib/ui/CaseACocher.svelte';
	import Carte from '#lib/ui/Carte.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import ChampZone from '#lib/ui/ChampZone.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import Etapes from '#lib/ui/Etapes.svelte';

	let { data, form } = $props();

	let occupe = $state(false);
	const soumettre = ({ cancel }: { cancel: () => void }) => {
		if (occupe) return cancel();
		occupe = true;
		return async ({ update }: { update: (o: { reset: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			occupe = false;
		};
	};

	const etapes = ETAPES_ASSISTANT.map((libelle, i) => ({
		libelle,
		href: `/bienvenue?etape=${i + 1}`
	}));
	const titre = $derived(
		data.etape === 'fin' ? TEXTES.cahier_pret : (ETAPES_ASSISTANT[(data.etape as number) - 1] ?? '')
	);
	const saisie = $derived((form?.saisie ?? {}) as Record<string, string>);
	const erreurs = $derived(form?.erreur?.champs ?? {});

	const moisOptions = Array.from({ length: 12 }, (_, i) => ({
		valeur: String(i + 1),
		libelle: capitaliser(nomDuMois(i + 1))
	}));

	// Étape Vos Comptes.
	const exerciceTenu = $derived(data.exercices.find((e) => e.statut !== 'repere') ?? null);
	const annee = $derived(exerciceTenu?.anneeDebut ?? data.anneeCourante);
	const annees = $derived(
		exerciceTenu
			? [{ valeur: String(annee), libelle: exerciceTenu.libelle }]
			: [0, -1].map((d) => ({
					valeur: String(data.anneeCourante + d),
					libelle: libelleExercice(data.anneeCourante + d, data.mois)
				}))
	);
	let anneeChoisie = $state('');
	const anneeEffective = $derived(Number(anneeChoisie || annee));
	const dateDepart = $derived(bornesExercice(anneeEffective, data.mois).debut);

	type Rangee = { cle: number; id?: number; libelle: string; type: string; solde: string };
	const typesCompte = [
		{ valeur: 'banque', libelle: 'Compte courant' },
		{ valeur: 'epargne', libelle: 'Livret' },
		{ valeur: 'caisse', libelle: LIBELLES_TYPE_COMPTE.caisse }
	];

	function rangeesDepart(): Rangee[] {
		if (data.comptes.length > 0) {
			return data.comptes.map((c, i) => ({
				cle: i,
				id: c.id,
				libelle: c.libelle,
				type: c.type,
				solde: c.ancre ? formaterSaisie(c.ancre.solde) : ''
			}));
		}
		return [
			{ cle: 0, libelle: 'Compte courant', type: 'banque', solde: '' },
			{ cle: 1, libelle: 'Livret', type: 'epargne', solde: '' },
			{ cle: 2, libelle: 'Caisse', type: 'caisse', solde: '' }
		];
	}

	let rangees = $state<Rangee[]>([]);
	$effect.pre(() => {
		if (data.etape === 2 && rangees.length === 0) rangees = rangeesDepart();
	});

	function ajouterRangee() {
		const cle = Math.max(-1, ...rangees.map((r) => r.cle)) + 1;
		rangees.push({ cle, libelle: '', type: 'caisse', solde: '' });
	}

	function retirerRangee(cle: number) {
		rangees = rangees.filter((r) => r.cle !== cle);
	}
</script>

<div class="assistant">
	<EnTete {titre} contexte="Assistant de démarrage" sansTitre />
	<header class="tete">
		{#if data.etape !== 'fin'}
			<Etapes
				{etapes}
				courante={data.etape as number}
				atteinte={Math.min(data.atteinte, 3) + (data.atteinte > 3 ? 1 : 0)}
			/>
		{/if}
	</header>

	{#if data.etape === 'fin'}
		<Carte>
			<div class="fin">
				<CheckCheck size={40} strokeWidth={1.75} aria-hidden="true" />
				<h1 class="t-display" tabindex="-1">{TEXTES.cahier_pret}</h1>
				<p class="t-muted">
					Vos Comptes ont leurs soldes de départ. Vos Natures et vos Actions sont en place.
				</p>
				<div class="suites">
					{#if data.suites.importer}
						<Bouton href="/pointage">Importer un relevé</Bouton>
					{/if}
					{#if data.suites.saisir}
						<Bouton
							href="/operations?op=nouvelle"
							variante={data.suites.importer ? 'secondaire' : 'principal'}
						>
							Saisir une Opération
						</Bouton>
					{/if}
					<Bouton
						href="/"
						variante={data.suites.importer || data.suites.saisir ? 'discret' : 'principal'}
					>
						Aller au Tableau de contrôle
					</Bouton>
				</div>
			</div>
		</Carte>
	{:else}
		<Carte>
			<h1 class="t-title" tabindex="-1">{titre}</h1>

			{#if form?.erreur && Object.keys(form.erreur.champs).length === 0}
				<div class="alerte"><Bandeau ton="erreur" alerte>{form.erreur.message}</Bandeau></div>
			{/if}

			{#if data.etape === 1}
				<p class="intro t-muted">
					Ces informations figureront sur vos documents. Tout se modifie ensuite.
				</p>
				<form method="post" action="?/ape" class="pile" use:enhance={soumettre}>
					<Champ
						etiquette="Nom de l’APE"
						name="nom"
						required
						valeur={saisie.nom ?? data.association?.nom ?? ''}
						erreur={erreurs.nom}
					/>
					<ChampZone
						etiquette="Adresse"
						name="adresse"
						autocomplete="street-address"
						valeur={saisie.adresse ?? data.association?.adresse ?? ''}
					/>
					<ChampListe
						etiquette="Mois de début d’Exercice"
						name="moisDebutExercice"
						options={moisOptions}
						valeur={saisie.moisDebutExercice ?? String(data.association?.moisDebutExercice ?? 9)}
					/>
					<input
						type="hidden"
						name="mentionsFacture"
						value={data.association?.mentionsFacture ?? ''}
					/>
					<div class="navigation">
						<a class="t-label" href="/">Reprendre plus tard</a>
						<Bouton type="submit" {occupe}>Continuer</Bouton>
					</div>
				</form>
			{:else if data.etape === 2}
				<p class="intro t-muted">
					Indiquez ce qu’il y avait sur chaque Compte au {formaterDateLongue(dateDepart)}. Le solde
					se lit sur le relevé, une caisse se compte à la main.
				</p>
				<form method="post" action="?/comptes" class="pile" use:enhance={soumettre}>
					<ChampListe
						etiquette="Premier Exercice tenu dans l’outil"
						name="anneeDebut"
						options={annees}
						aide="L’Exercice précédent s’ajoute comme repère, pour y rattacher une dépense."
						valeur={String(annee)}
						onchange={(v) => (anneeChoisie = v)}
					/>
					<ul class="comptes" class:sans-retrait={rangees.every((r) => r.id)}>
						{#each rangees as r, i (r.cle)}
							<li class="rangee">
								{#if r.id}<input type="hidden" name="id-{i}" value={r.id} />{/if}
								<Champ
									id="libelle-{i}"
									etiquette="Nom du Compte"
									name="libelle-{i}"
									bind:valeur={r.libelle}
									erreur={erreurs[`libelle-${i}`]}
								/>
								{#if r.id}
									<input type="hidden" name="type-{i}" value={r.type} />
									<Champ
										id="type-{i}"
										etiquette="Type"
										name="type-lecture-{i}"
										lectureSeule
										valeur={typesCompte.find((t) => t.valeur === r.type)?.libelle ?? r.type}
									/>
								{:else}
									<ChampListe
										id="type-{i}"
										etiquette="Type"
										name="type-{i}"
										options={typesCompte}
										bind:valeur={r.type}
									/>
								{/if}
								<ChampMontant
									id="solde-{i}"
									etiquette="Solde de départ"
									name="solde-{i}"
									bind:valeur={r.solde}
									erreur={erreurs[`solde-${i}`]}
								/>
								<div class="retirer">
									{#if !r.id}
										<button
											type="button"
											aria-label="Retirer ce Compte"
											onclick={() => retirerRangee(r.cle)}
										>
											<Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
					<div>
						<Bouton variante="secondaire" onclick={ajouterRangee}>
							<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
							Ajouter un Compte
						</Bouton>
					</div>
					<div class="navigation">
						<a class="t-label" href="/bienvenue?etape=1">Retour</a>
						<Bouton type="submit" {occupe}>Continuer</Bouton>
					</div>
				</form>
			{:else}
				<p class="intro t-muted">
					Gardez ce qui vous parle, tout se modifie ensuite. Les Natures de l’outil, comme l’Écart
					de caisse, sont toujours présentes.
				</p>
				<form method="post" action="?/liste" class="pile" use:enhance={soumettre}>
					<div class="colonnes">
						<fieldset>
							<legend class="t-heading">Natures</legend>
							{#each data.naturesType as n (n.libelle)}
								<CaseACocher name="nature" value={n.libelle} coche={true} id="nature-{n.libelle}">
									{n.libelle}
								</CaseACocher>
							{/each}
						</fieldset>
						<fieldset>
							<legend class="t-heading">Actions</legend>
							{#each data.actionsType as a (a.libelle)}
								<CaseACocher
									name="action"
									value={a.libelle}
									coche={data.actionsExistantes.includes(a.libelle)}
									id="action-{a.libelle}"
								>
									{a.libelle}
								</CaseACocher>
							{/each}
						</fieldset>
					</div>
					<div class="navigation">
						<a class="t-label" href="/bienvenue?etape=2">Retour</a>
						<Bouton type="submit" {occupe}>Terminer</Bouton>
					</div>
				</form>
			{/if}
		</Carte>
	{/if}
</div>

<style>
	.assistant {
		display: grid;
		gap: var(--espace-5);
	}

	.intro {
		margin: var(--espace-2) 0 var(--espace-5);
	}

	.alerte {
		margin-top: var(--espace-4);
	}

	.pile {
		display: grid;
		gap: var(--espace-4);
	}

	.comptes {
		display: grid;
		gap: var(--espace-3);
	}

	.rangee {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) var(--espace-row);
		gap: var(--espace-2);
		align-items: start;
	}

	.sans-retrait .rangee {
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
	}

	.sans-retrait .retirer {
		display: none;
	}

	.retirer {
		padding-top: calc(var(--typo-label-taille) * var(--typo-label-interligne) + var(--espace-1));
	}

	.retirer button {
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

	.retirer button:hover {
		background: var(--surface-sunken);
		color: var(--ink);
	}

	.navigation {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
		margin-top: var(--espace-2);
	}

	.navigation a {
		display: inline-flex;
		align-items: center;
		min-height: var(--espace-touch);
	}

	.colonnes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--espace-5);
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--espace-2);
	}

	.fin {
		display: grid;
		justify-items: center;
		gap: var(--espace-3);
		padding: var(--espace-5) 0;
		text-align: center;
	}

	.fin :global(svg) {
		color: var(--success);
	}

	.suites {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--espace-2);
		margin-top: var(--espace-3);
	}

	@media (max-width: 639.98px) {
		.rangee {
			grid-template-columns: minmax(0, 1fr) var(--espace-touch);
			padding-bottom: var(--espace-3);
			border-bottom: 1px solid var(--border);
		}

		.rangee > :global(*):not(.retirer) {
			grid-column: 1;
		}

		.sans-retrait .rangee {
			grid-template-columns: minmax(0, 1fr);
		}

		.retirer {
			grid-column: 2;
			grid-row: 1;
		}
	}
</style>
