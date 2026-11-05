<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import type { FicheChequeRecu } from '#lib/domaine/cheques/vues.ts';
	import { exerciceDeDate } from '#lib/domaine/etats/soldes.ts';
	import { centimes, formaterMontant, lireMontant, type Centimes } from '#lib/domaine/montant.ts';
	import type { ContexteSaisie } from '#lib/domaine/operations/vues.ts';
	import { message, messageErreur, TEXTES, type CodeMessage } from '#lib/messages.ts';
	import { envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import ResteARepartir from '#lib/ui/operation/ResteARepartir.svelte';
	import { nouvelleCle, Saisie } from '#lib/ui/operation/saisie.svelte.ts';
	import Ventilation from '#lib/ui/operation/Ventilation.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import type { OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import Touche from '#lib/ui/Touche.svelte';
	import type { EtatRafale } from './SaisieRafale.svelte';

	type Props = {
		contexte: ContexteSaisie;
		/** Nul : nouveau chèque, repris de la rangée de saisie. */
		fiche: FicheChequeRecu | null;
		rafale: EtatRafale;
		banques: readonly string[];
		fermer: () => void;
		apres: (nom: string) => void;
	};

	let { contexte, fiche, rafale, banques, fermer, apres }: Props = $props();

	function etatInitial() {
		const s = new Saisie(rafale.date, null);
		s.choix = 'recette';
		if (fiche) {
			s.charger(
				fiche.operation,
				exerciceDeDate(contexte.exercices, fiche.operation.date)?.id ?? null
			);
			return s;
		}
		s.montant = rafale.montant;
		s.surMontant();
		const [l] = s.lignes;
		if (l) {
			l.natureId = rafale.natureId;
			l.actionId = rafale.actionId;
		}
		return s;
	}

	const saisie = untrack(etatInitial);
	let emetteur = $state(untrack(() => fiche?.emetteur ?? rafale.emetteur));
	let banque = $state(untrack(() => fiche?.banque ?? rafale.banque));
	let numero = $state(untrack(() => fiche?.numero ?? ''));
	let occupe = $state(false);
	let modifie = $state(false);
	let erreurs = $state<Record<string, string>>({});
	let alerte = $state<{ texte: string; reessayer: boolean } | null>(null);
	let zoneReste = $state<HTMLElement | null>(null);

	const options = (l: readonly { id: number; libelle: string; actif: boolean }[]) =>
		l.filter((x) => x.actif).map(({ id, libelle }): OptionRecherche => ({ id, libelle }));

	const natures = $derived(options(contexte.natures.filter((n) => n.codeSysteme === null)));
	const actions = $derived(options(contexte.actions));
	const exerciceDeLaDate = $derived(exerciceDeDate(contexte.exercices, saisie.date));
	const anterieurs = $derived(
		exerciceDeLaDate
			? contexte.exercices.filter((e) => e.anneeDebut < exerciceDeLaDate.anneeDebut)
			: []
	);
	const titre = $derived(fiche ? `Chèque de ${fiche.emetteur}` : 'Nouveau Chèque reçu');

	function montantPositif(texte: string, champ: string): Centimes | null {
		const net = texte.trim();
		if (net === '') {
			erreurs[champ] = message('champ_requis');
			return null;
		}
		const r = lireMontant(net);
		if (!r.ok || r.valeur <= 0) {
			erreurs[champ] = message('montant_invalide');
			return null;
		}
		return r.valeur;
	}

	function preparer() {
		erreurs = {};
		if (emetteur.trim() === '') erreurs.emetteur = message('champ_requis');
		if (saisie.date === '') erreurs.date = message('champ_requis');
		const total = montantPositif(saisie.montant, 'montant');
		const lignes = saisie.lignes.map((l, i) => {
			const lu = montantPositif(l.montant, `lignes.${i}.montant`);
			if (l.natureId === null) erreurs[`lignes.${i}.natureId`] = message('champ_requis');
			return {
				montant: lu ?? 0,
				contraire: l.contraire,
				reduction: false,
				natureId: l.natureId,
				actionId: l.actionId,
				exerciceRattachementId: l.rattachementId,
				note: l.note || null
			};
		});
		if (total === null || Object.keys(erreurs).length > 0) return null;
		if (saisie.reste !== 0) {
			alerte = {
				reessayer: false,
				texte: messageErreur({
					code: saisie.reste > 0 ? 'ventilation_incomplete' : 'ventilation_excedent',
					details: { montant: formaterMontant(centimes(Math.abs(saisie.reste))) }
				})
			};
			zoneReste?.focus();
			return null;
		}
		return {
			emetteur: emetteur.trim(),
			banque: banque || null,
			numero: numero || null,
			date: saisie.date,
			montant: total,
			lignes
		};
	}

	function focusErreur() {
		queueMicrotask(() =>
			document.querySelector<HTMLElement>('.ape-panneau [aria-invalid="true"]')?.focus()
		);
	}

	async function enregistrer() {
		if (occupe) return;
		alerte = null;
		const corps = preparer();
		if (corps === null) {
			focusErreur();
			return;
		}
		occupe = true;
		const r = fiche
			? await envoyer(`/api/cheques/recus/${fiche.id}`, {
					...corps,
					version: fiche.operation.version
				})
			: await envoyer('/api/cheques/recus', { ...corps, cle: saisie.cle });
		occupe = false;
		if (r.type === 'ok') {
			modifie = false;
			saisie.cle = nouvelleCle();
			afficherToast(TEXTES.enregistre);
			apres(corps.emetteur);
			fermer();
			await refreshAll();
		} else if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = { texte: message('reseau_coupe'), reessayer: true };
		} else if (r.type === 'serveur') {
			alerte = { texte: message('erreur_serveur'), reessayer: true };
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
			focusErreur();
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
			focusErreur();
		} else {
			alerte = { texte: messageErreur(r.erreur), reessayer: false };
		}
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			enregistrer();
		}
	}

	async function creerVolee(chemin: string, libelle: string, liste: OptionRecherche[]) {
		const r = await envoyer<{ id: number; libelle: string }>(chemin, { libelle });
		if (r.type !== 'ok') return null;
		liste.push(r.valeur);
		return r.valeur.id;
	}

	let naturesCreees = $state<OptionRecherche[]>([]);
	let actionsCreees = $state<OptionRecherche[]>([]);
</script>

<Panneau ouvert {titre} {fermer} bind:modifie {surTouche}>
	<div class="formulaire">
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
		<Champ
			etiquette="Émetteur"
			id="cheque-emetteur"
			name="emetteur"
			bind:valeur={emetteur}
			erreur={erreurs.emetteur}
			autocomplete="off"
		/>
		<div class="deux">
			<Champ
				etiquette="Banque"
				id="cheque-banque"
				name="banque"
				list="cheque-banques"
				bind:valeur={banque}
				erreur={erreurs.banque}
				autocomplete="off"
			/>
			<datalist id="cheque-banques">
				{#each banques as b (b)}<option value={b}></option>{/each}
			</datalist>
			<Champ
				etiquette="N° du chèque"
				id="cheque-numero"
				name="numero"
				aide="Facultatif : il apparaît sur le bordereau."
				bind:valeur={numero}
				erreur={erreurs.numero}
				autocomplete="off"
			/>
		</div>
		<div class="deux">
			<Champ
				etiquette="Date"
				id="cheque-date"
				name="date"
				type="date"
				bind:valeur={saisie.date}
				erreur={erreurs.date}
			/>
			<ChampMontant
				etiquette="Montant"
				id="cheque-montant"
				name="montant"
				bind:valeur={saisie.montant}
				erreur={erreurs.montant}
				oninput={() => saisie.surMontant()}
				onsortie={() => saisie.surMontant()}
			/>
		</div>
		<section class="repartir" aria-label="Répartir">
			<h3 class="t-heading">Répartir</h3>
			<Ventilation
				{saisie}
				natures={[...natures, ...naturesCreees]}
				actions={[...actions, ...actionsCreees]}
				recentsNatures={contexte.recents.natures}
				recentsActions={contexte.recents.actions}
				{anterieurs}
				{erreurs}
				ligneDeRecette
				creerNature={(t) => creerVolee('/api/natures', t, naturesCreees)}
				creerAction={(t) => creerVolee('/api/actions', t, actionsCreees)}
			/>
		</section>
	</div>

	{#snippet avantPied()}
		{#if saisie.total !== null}
			<ResteARepartir
				reste={saisie.reste}
				bind:zone={zoneReste}
				ajouter={() => {
					const l = saisie.ajouterLigne(saisie.reste);
					queueMicrotask(() => document.getElementById(`ligne-${l.cle}-montant`)?.focus());
				}}
			/>
		{/if}
	{/snippet}

	{#snippet pied()}
		<Bouton {occupe} onclick={enregistrer}>
			Enregistrer
			<span class="touches"><Touche>Ctrl</Touche><Touche>Entrée</Touche></span>
		</Bouton>
	{/snippet}
</Panneau>

<style>
	.formulaire {
		display: grid;
		gap: var(--espace-4);
	}

	.deux {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: var(--espace-3);
	}

	.repartir {
		display: grid;
		gap: var(--espace-2);
	}

	.touches {
		display: inline-flex;
		gap: 2px;
		color: var(--ink);
	}

	@media (max-width: 639.98px) {
		.deux {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
