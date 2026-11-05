<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { Split } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { lireMontant, type Centimes } from '#lib/domaine/montant.ts';
	import type { ContexteSaisie } from '#lib/domaine/operations/vues.ts';
	import { message, messageErreur, type CodeMessage } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import { nouvelleCle } from '#lib/ui/operation/saisie.svelte.ts';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { changerUrl } from '#lib/ui/url.ts';

	export type EtatRafale = {
		emetteur: string;
		banque: string;
		date: string;
		montant: string;
		actionId: number | null;
		natureId: number | null;
	};

	type Props = {
		contexte: ContexteSaisie;
		natureParAction: Record<number, number>;
		banques: readonly string[];
		/** La rangée vit dans la page : le `panneau` en repart, et la rend vide à son retour. */
		rafale: EtatRafale;
		dernier: string;
	};

	let { contexte, natureParAction, banques, rafale, dernier = $bindable() }: Props = $props();

	let cle = $state(nouvelleCle());
	let occupe = $state(false);
	let erreurs = $state<Record<string, string>>({});
	let alerte = $state<{ texte: string; reessayer: boolean } | null>(null);
	let champEmetteur = $state<HTMLInputElement>();

	const options = (
		l: readonly { id: number; libelle: string; actif: boolean }[]
	): OptionRecherche[] => l.filter((x) => x.actif).map(({ id, libelle }) => ({ id, libelle }));

	const actions = $derived(options(contexte.actions));
	const natures = $derived(options(contexte.natures.filter((n) => n.codeSysteme === null)));
	const ouvert = $derived(contexte.exercices.some((e) => e.statut === 'ouvert'));

	/** La Nature suit l'Action : elle reste à vue, et se corrige. */
	function surAction(id: number | null) {
		rafale.actionId = id;
		const connue = id === null ? undefined : natureParAction[id];
		if (connue !== undefined) rafale.natureId = connue;
	}

	function controler(): { montant: Centimes } | null {
		const e: Record<string, string> = {};
		if (rafale.emetteur.trim() === '') e.emetteur = message('champ_requis');
		if (rafale.date === '') e.date = message('champ_requis');
		if (rafale.natureId === null) e['lignes.0.natureId'] = message('champ_requis');
		const lu = rafale.montant.trim() === '' ? null : lireMontant(rafale.montant);
		if (lu === null) e.montant = message('champ_requis');
		else if (!lu.ok || lu.valeur <= 0) e.montant = message('montant_invalide');
		erreurs = e;
		if (Object.keys(e).length > 0 || lu === null || !lu.ok) return null;
		return { montant: lu.valeur };
	}

	function premiereErreur() {
		queueMicrotask(() => {
			document.querySelector<HTMLElement>('.rafale [aria-invalid="true"]')?.focus();
		});
	}

	async function enregistrer() {
		if (occupe) return;
		alerte = null;
		const lu = controler();
		if (lu === null) {
			premiereErreur();
			return;
		}
		occupe = true;
		const nom = rafale.emetteur.trim();
		const r = await envoyer<{ id: number }>('/api/cheques/recus', {
			cle,
			emetteur: nom,
			banque: rafale.banque || null,
			numero: null,
			date: rafale.date,
			montant: lu.montant,
			lignes: [{ montant: lu.montant, natureId: rafale.natureId, actionId: rafale.actionId }]
		});
		occupe = false;
		if (r.type === 'ok') {
			cle = nouvelleCle();
			rafale.emetteur = '';
			rafale.banque = '';
			rafale.montant = '';
			erreurs = {};
			dernier = `Chèque de ${nom} enregistré.`;
			await refreshAll();
			await tick();
			champEmetteur?.focus();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = { texte: message('reseau_coupe'), reessayer: true };
		} else if (r.type === 'serveur') {
			alerte = { texte: message('erreur_serveur'), reessayer: true };
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
			premiereErreur();
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
			premiereErreur();
		} else {
			alerte = { texte: messageErreur(r.erreur), reessayer: false };
		}
	}

	function surTouche(e: KeyboardEvent) {
		// `defaultPrevented` : Entrée vient de choisir dans une liste, la suivante enregistrera.
		if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
		if ((e.target as HTMLElement).closest('button, a')) return;
		e.preventDefault();
		enregistrer();
	}

	$effect(() => {
		// À l'arrivée sur la page, la pile attend : le curseur est déjà dans la première case.
		untrack(() => {
			if (!window.matchMedia('(min-width: 640px)').matches) return;
			if (new URL(location.href).searchParams.has('cheque')) return;
			champEmetteur?.focus();
		});
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	class="rafale seulement-ordinateur"
	aria-label="Enregistrer un Chèque reçu"
	onkeydown={surTouche}
	onsubmit={(e) => {
		e.preventDefault();
		enregistrer();
	}}
>
	{#if !ouvert}
		<Bandeau ton="regarder"
			>Aucun Exercice n’est ouvert : un chèque ne pourrait pas s’enregistrer.</Bandeau
		>
	{/if}
	{#if alerte}
		<Bandeau ton="regarder" alerte>
			{alerte.texte}
			{#snippet action()}
				{#if alerte?.reessayer}
					<Bouton variante="secondaire" {occupe} onclick={enregistrer}>Réessayer</Bouton>
				{/if}
			{/snippet}
		</Bandeau>
	{/if}
	<div class="champs">
		<div class="emetteur">
			<Champ
				etiquette="Émetteur"
				id="rafale-emetteur"
				name="emetteur"
				bind:valeur={rafale.emetteur}
				bind:champ={champEmetteur}
				erreur={erreurs.emetteur}
				autocomplete="off"
			/>
		</div>
		<div class="banque">
			<Champ
				etiquette="Banque"
				id="rafale-banque"
				name="banque"
				list="rafale-banques"
				bind:valeur={rafale.banque}
				erreur={erreurs.banque}
				autocomplete="off"
			/>
			<datalist id="rafale-banques">
				{#each banques as b (b)}<option value={b}></option>{/each}
			</datalist>
		</div>
		<div class="montant-rafale">
			<ChampMontant
				etiquette="Montant"
				id="rafale-montant"
				name="montant"
				bind:valeur={rafale.montant}
				erreur={erreurs.montant}
			/>
		</div>
		<div class="date">
			<Champ
				etiquette="Date"
				id="rafale-date"
				name="date"
				type="date"
				bind:valeur={rafale.date}
				erreur={erreurs.date}
			/>
		</div>
		<div class="action">
			<SelecteurRecherche
				etiquette="Action"
				id="rafale-action"
				options={actions}
				valeur={rafale.actionId}
				onchange={surAction}
				recents={contexte.recents.actions}
				sansValeur="Sans Action"
				onfin={enregistrer}
			/>
		</div>
		<div class="nature">
			<SelecteurRecherche
				etiquette="Nature"
				id="rafale-nature"
				options={natures}
				bind:valeur={rafale.natureId}
				recents={contexte.recents.natures}
				erreur={erreurs['lignes.0.natureId']}
				onfin={enregistrer}
			/>
		</div>
		<div class="boutons">
			<Bouton type="submit" {occupe}>Enregistrer</Bouton>
		</div>
	</div>
	<p class="suite">
		<button
			type="button"
			class="plusieurs t-label"
			onclick={() => changerUrl({ cheque: 'nouveau' })}
		>
			<Split size={16} strokeWidth={1.75} aria-hidden="true" />
			Plusieurs Actions pour ce chèque
		</button>
		<span class="t-caption t-muted" role="status">
			{dernier || 'Entrée enregistre et repart, en gardant la date et l’Action.'}
		</span>
	</p>
</form>

<style>
	.rafale {
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-3) var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.champs {
		display: grid;
		grid-template-columns:
			minmax(9rem, 1.5fr) minmax(6rem, 1fr) 7rem 9.5rem minmax(8rem, 1fr) minmax(8rem, 1fr)
			auto;
		align-items: start;
		gap: var(--espace-2);
	}

	.boutons {
		/* Aligné sur les champs : leur étiquette occupe la première ligne. */
		padding-top: calc(var(--typo-label-taille) * var(--typo-label-interligne) + var(--espace-1));
	}

	.suite {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-1) var(--espace-4);
	}

	.plusieurs {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		min-height: var(--espace-row);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--primary);
		font: inherit;
		cursor: pointer;
	}

	.plusieurs:hover {
		text-decoration: underline;
	}

	@media (max-width: 1099.98px) {
		.champs {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}

		.emetteur,
		.banque {
			grid-column: span 3;
		}

		.date,
		.montant-rafale,
		.action,
		.nature {
			grid-column: span 3;
		}

		.boutons {
			grid-column: span 6;
			justify-self: end;
			padding-top: 0;
		}
	}
</style>
