<script lang="ts">
	import { CornerUpLeft, Ellipsis, Plus } from '@lucide/svelte';
	import { centimes } from '#lib/domaine/montant.ts';
	import { montantPourSolder } from '#lib/domaine/operations/ventilation.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import Pastille from '#lib/ui/Pastille.svelte';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import type { LigneEtat, Saisie } from './saisie.svelte.ts';

	type Props = {
		saisie: Saisie;
		natures: readonly OptionRecherche[];
		actions: readonly OptionRecherche[];
		recentsNatures: readonly number[];
		recentsActions: readonly number[];
		/** Exercices d'`annee_debut` inférieure, repères et clôturés compris (O6). */
		anterieurs: readonly { id: number; libelle: string }[];
		erreurs: Record<string, string>;
		creerNature: (texte: string) => Promise<number | null>;
		creerAction: (texte: string) => Promise<number | null>;
		ligneDeRecette: boolean;
		/** Versement SumUp : les deux Lignes se nomment, le premier regard suffit. */
		etiquettes?: readonly string[];
	};

	let {
		saisie,
		natures,
		actions,
		recentsNatures,
		recentsActions,
		anterieurs,
		erreurs,
		creerNature,
		creerAction,
		ligneDeRecette,
		etiquettes = []
	}: Props = $props();

	const totalPositif = $derived(centimes(Math.abs(saisie.total ?? 0)));

	function focusMontant(l: LigneEtat) {
		queueMicrotask(() => document.getElementById(`ligne-${l.cle}-montant`)?.focus());
	}

	/** `Entrée` dans la dernière colonne : une Ligne arrive, prête avec le reste. */
	function ligneSuivante() {
		if (saisie.reste <= 0) return;
		focusMontant(saisie.ajouterLigne(saisie.reste));
	}

	function dupliquer(i: number) {
		const l = saisie.lignes[i] as LigneEtat;
		const copie = saisie.ajouterLigne();
		copie.montant = l.montant;
		copie.contraire = l.contraire;
		copie.natureId = l.natureId;
		copie.actionId = l.actionId;
		copie.note = l.note;
		copie.noteOuverte = l.noteOuverte;
		focusMontant(copie);
	}

	function supprimer(i: number) {
		const [retiree] = saisie.lignes.splice(i, 1);
		if (retiree === undefined) return;
		if (saisie.lignes.length === 0) saisie.ajouterLigne();
		afficherToast('Ligne supprimée.', {
			libelle: 'Annuler',
			faire: () => saisie.lignes.splice(i, 0, retiree)
		});
	}

	const resteDe = (i: number) => montantPourSolder(totalPositif, saisie.parts, i);
	const libelleSens = $derived(ligneDeRecette ? 'Ligne de dépense' : 'Ligne de recette');
</script>

<div class="entetes t-label t-muted">
	<span>Montant</span>
	<span><AideTerme ancre="nature">Nature</AideTerme></span>
	<span><AideTerme ancre="action">Action</AideTerme></span>
</div>

<ul class="ventilation">
	{#each saisie.lignes as l, i (l.cle)}
		{@const nom = `Ligne ${i + 1}`}
		<li class="ligne">
			{#if etiquettes[i]}<p class="etiquette-ligne t-label">{etiquettes[i]}</p>{/if}
			<div class="rangee">
				<div class="montant-ligne">
					<ChampMontant
						etiquette="Montant de la {nom.toLocaleLowerCase('fr')}"
						masquerEtiquette
						placeholder="Montant"
						name="ligne-{l.cle}-montant"
						id="ligne-{l.cle}-montant"
						bind:valeur={l.montant}
						reste={resteDe(i)}
						erreur={erreurs[`lignes.${i}.montant`]}
						oninput={() => {
							l.auto = false;
							if (i === 0) saisie.brutSuitFrais = false;
							else saisie.surFrais();
						}}
					/>
				</div>
				<div class="col-nature">
					<SelecteurRecherche
						etiquette="Nature de la {nom.toLocaleLowerCase('fr')}"
						masquerEtiquette
						id="ligne-{l.cle}-nature"
						options={natures}
						bind:valeur={l.natureId}
						recents={recentsNatures}
						creer={creerNature}
						libelleCreer={(t) => `Créer la Nature ${t}`}
						placeholder="Nature"
						suggere={l.suggestion !== null}
						descriptionId={l.suggestion ? `ligne-${l.cle}-suggestion` : undefined}
						onaccepter={() => (l.suggestion = null)}
						onchange={() => (l.suggestion = null)}
						erreur={erreurs[`lignes.${i}.natureId`]}
					/>
				</div>
				<div class="col-action">
					<SelecteurRecherche
						etiquette="Action de la {nom.toLocaleLowerCase('fr')}"
						masquerEtiquette
						id="ligne-{l.cle}-action"
						options={actions}
						bind:valeur={l.actionId}
						recents={recentsActions}
						sansValeur="Sans Action"
						creer={creerAction}
						libelleCreer={(t) => `Créer l’Action ${t}`}
						suggere={l.suggestion !== null && l.actionId !== null}
						onaccepter={() => (l.suggestion = null)}
						onchange={() => (l.suggestion = null)}
						onfin={ligneSuivante}
						erreur={erreurs[`lignes.${i}.actionId`]}
					/>
				</div>
				<div class="menu-ligne">
					<Menu nom="Actions de la {nom.toLocaleLowerCase('fr')}" flottant classe="bouton-ligne">
						{#snippet bouton()}<Ellipsis
								size={20}
								strokeWidth={1.75}
								aria-hidden="true"
							/>{/snippet}
						<button type="button" onclick={() => (l.noteOuverte = true)}>Ajouter une note</button>
						{#if anterieurs.length > 0}
							<button type="button" onclick={() => (l.rattachementOuvert = true)}>
								Rattacher à un Exercice antérieur
							</button>
						{/if}
						<button
							type="button"
							onclick={() => {
								l.contraire = !l.contraire;
								l.auto = false;
							}}
						>
							{l.contraire ? 'Remettre dans le sens de l’Opération' : `Passer en ${libelleSens}`}
						</button>
						<button type="button" onclick={() => dupliquer(i)}>Dupliquer</button>
						<button type="button" onclick={() => supprimer(i)}>Supprimer</button>
					</Menu>
				</div>
			</div>

			{#if l.suggestion}
				<p class="marques" id="ligne-{l.cle}-suggestion">
					<Pastille etat="suggestion" />
					<span class="t-caption t-muted">{l.suggestion}</span>
				</p>
			{/if}

			{#if l.contraire || l.reduction || l.rattachementId !== null}
				<p class="marques">
					{#if (l.contraire && !ligneDeRecette) || l.reduction}
						<span class="t-caption t-muted">réduit la dépense</span>
					{:else if l.contraire}
						<span class="t-caption t-muted">Ligne de dépense</span>
					{/if}
					{#if l.rattachementId !== null}
						<Pastille
							etat="rattachee"
							texte="Sur {anterieurs.find((e) => e.id === l.rattachementId)?.libelle ?? ''}"
						/>
					{/if}
				</p>
			{/if}

			{#if l.rattachementOuvert}
				<div class="complement">
					<CornerUpLeft size={16} strokeWidth={1.75} aria-hidden="true" />
					<ChampListe
						etiquette="Exercice de rattachement"
						name="ligne-{l.cle}-rattachement"
						options={[
							{ valeur: '', libelle: 'L’Exercice de l’Opération' },
							...anterieurs.map((e) => ({ valeur: String(e.id), libelle: e.libelle }))
						]}
						valeur={l.rattachementId === null ? '' : String(l.rattachementId)}
						onchange={(v) => (l.rattachementId = v === '' ? null : Number(v))}
						erreur={erreurs[`lignes.${i}.rattachement`]}
					/>
				</div>
			{/if}

			{#if l.noteOuverte}
				<div class="complement">
					<Champ
						etiquette="Note de la {nom.toLocaleLowerCase('fr')}"
						name="ligne-{l.cle}-note"
						bind:valeur={l.note}
					/>
				</div>
			{/if}
		</li>
	{/each}
</ul>

<button class="ajout" type="button" onclick={() => focusMontant(saisie.ajouterLigne(saisie.reste))}>
	<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
	Ajouter une Ligne
</button>

<style>
	.ventilation {
		display: grid;
		gap: var(--espace-2);
	}

	.rangee {
		display: grid;
		grid-template-columns: 124px minmax(0, 1fr) minmax(0, 1fr) var(--espace-row);
		grid-template-areas: 'montant nature action menu';
		align-items: start;
		gap: var(--espace-2);
	}

	.entetes {
		display: grid;
		grid-template-columns: 124px minmax(0, 1fr) minmax(0, 1fr) var(--espace-row);
		gap: var(--espace-2);
		margin-bottom: calc(-1 * var(--espace-1));
	}

	.etiquette-ligne {
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.montant-ligne {
		grid-area: montant;
	}

	.menu-ligne {
		grid-area: menu;
	}

	.col-nature {
		grid-area: nature;
		min-width: 0;
	}

	.col-action {
		grid-area: action;
		min-width: 0;
	}

	:global(.bouton-ligne) {
		justify-content: center;
		width: var(--espace-row) !important;
		color: var(--ink-muted);
	}

	:global(.bouton-ligne:hover) {
		background: var(--surface-sunken) !important;
	}

	.marques {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-2);
		margin-top: var(--espace-1);
		padding-left: 132px;
	}

	.complement {
		display: flex;
		align-items: flex-end;
		gap: var(--espace-2);
		margin-top: var(--espace-1);
		padding-left: 132px;
		color: var(--ink-muted);
	}

	.complement > :global(.champ) {
		flex: 1;
	}

	.complement > :global(svg) {
		flex: none;
		margin-bottom: 14px;
	}

	.ajout {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-2);
		min-height: var(--espace-row);
		margin-top: var(--espace-1);
		padding: 0 var(--espace-2);
		border: 0;
		border-radius: var(--rayon-md);
		background: transparent;
		color: var(--primary);
		font: inherit;
		font-weight: var(--typo-label-graisse);
		cursor: pointer;
	}

	.ajout:hover {
		background: var(--primary-soft);
	}

	/* Téléphone : chaque Ligne devient une petite carte. */
	@media (max-width: 639.98px) {
		.entetes {
			display: none;
		}

		.ligne {
			padding: var(--espace-3);
			border: 1px solid var(--border);
			border-radius: var(--rayon-md);
		}

		.rangee {
			grid-template-columns: minmax(0, 1fr) var(--espace-touch);
			grid-template-areas: 'montant menu' 'nature nature' 'action action';
		}

		.marques,
		.complement {
			padding-left: 0;
		}

		:global(.bouton-ligne) {
			width: var(--espace-touch) !important;
			min-height: var(--espace-touch);
		}

		.ajout {
			min-height: var(--espace-touch);
		}
	}
</style>
