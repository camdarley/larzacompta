<script lang="ts">
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { ArrowLeft, Plus, Trash2 } from '@lucide/svelte';
	import { onDestroy, tick, untrack } from 'svelte';
	import type { EntreeFacture, Facture, LigneFacture } from '#lib/domaine/factures/index.ts';
	import {
		centimes,
		formaterMontant,
		formaterSaisie,
		lireMontant,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import { message, messageErreur, TEXTES, type CodeMessage } from '#lib/messages.ts';
	import { demander, envoyer } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import ChampZone from '#lib/ui/ChampZone.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import EnTete from '#lib/ui/EnTete.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import ApercuPdf from './ApercuPdf.svelte';

	type Rangee = { cle: number; designation: string; quantite: string; prix: string };

	type Props = {
		facture: Facture | null;
		actions: readonly { id: number; libelle: string }[];
		tiers: readonly { nom: string; adresse: string }[];
		mentions: boolean;
		dateParDefaut: string;
	};

	let { facture, actions, tiers, mentions, dateParDefaut }: Props = $props();

	let prochaineCle = 1;
	const rangeeVide = (): Rangee => ({
		cle: prochaineCle++,
		designation: '',
		quantite: '1',
		prix: ''
	});
	const versRangee = (l: LigneFacture): Rangee => ({
		cle: prochaineCle++,
		designation: l.designation,
		quantite: String(l.quantite),
		prix: formaterSaisie(l.prixUnitaire)
	});

	let id = $state<number | null>(untrack(() => facture?.id ?? null));
	let tiersNom = $state(untrack(() => facture?.tiersNom ?? ''));
	let tiersAdresse = $state(untrack(() => facture?.tiersAdresse ?? ''));
	let dateEmission = $state(untrack(() => facture?.dateEmission ?? dateParDefaut));
	let actionId = $state<number | null>(untrack(() => facture?.actionId ?? null));
	let rangees = $state<Rangee[]>(
		untrack(() => (facture?.lignes.length ? facture.lignes.map(versRangee) : [rangeeVide()]))
	);

	let occupe = $state(false);
	let alerte = $state<string | null>(null);
	let erreurs = $state<Record<string, string>>({});
	let validation = $state<{ numero: string; total: Centimes } | null>(null);
	let confirmerSuppression = $state(false);
	let quitter = $state<string | null>(null);
	let sortie = false;

	const optionsAction = $derived(actions.map((a): OptionRecherche => ({ ...a })));

	/** Un prix vide vaut 0 tant que c'est un brouillon. Illisible, il se signale. */
	const prixDe = (r: Rangee): Centimes | null => {
		if (r.prix.trim() === '') return centimes(0);
		const lu = lireMontant(r.prix);
		return lu.ok ? lu.valeur : null;
	};
	const quantiteDe = (r: Rangee) => (/^\d+$/.test(r.quantite.trim()) ? Number(r.quantite) : null);
	const montantDe = (r: Rangee) => centimes((quantiteDe(r) ?? 0) * (prixDe(r) ?? 0));
	const total = $derived(centimes(rangees.reduce((t, r) => t + montantDe(r), 0)));
	const rempli = (r: Rangee) => r.designation.trim() !== '' || r.prix.trim() !== '';

	/** Ce qui part au serveur : une rangée laissée vide ne compte pas. */
	function saisie(): EntreeFacture {
		return {
			tiersNom: tiersNom.trim(),
			tiersAdresse: tiersAdresse.trim(),
			dateEmission: dateEmission === '' ? null : dateEmission,
			actionId,
			lignes: rangees.filter(rempli).map((r) => ({
				designation: r.designation.trim(),
				quantite: quantiteDe(r) ?? 0,
				prixUnitaire: prixDe(r) ?? (-1 as Centimes)
			}))
		};
	}

	/** L'aperçu montre ce qui est tapé, même incomplet : il ne se refuse jamais. */
	function saisieApercu(): EntreeFacture {
		const s = saisie();
		return {
			...s,
			lignes: s.lignes.map((l) => ({
				designation: l.designation,
				quantite: Math.max(l.quantite, 1),
				prixUnitaire: centimes(Math.max(l.prixUnitaire, 0))
			}))
		};
	}

	const empreinte = $derived(JSON.stringify(saisie()));
	let enregistre = $state(untrack(() => (facture ? JSON.stringify(saisie()) : null)));
	const modifie = $derived(
		enregistre === null ? rangees.some(rempli) || tiersNom !== '' : empreinte !== enregistre
	);

	// Aperçu : quand la frappe se calme, le PDF se refait, sans rien enregistrer.
	let versionApercu = $state(0);
	let minuteur: ReturnType<typeof setTimeout> | undefined;
	let demande = 0;

	async function rafraichirApercu() {
		const numero = ++demande;
		const r = await envoyer('/api/factures/apercu', saisieApercu());
		if (r.type === 'ok' && numero === demande) versionApercu += 1;
	}

	$effect(() => {
		void empreinte;
		clearTimeout(minuteur);
		minuteur = setTimeout(rafraichirApercu, 350);
	});
	onDestroy(() => clearTimeout(minuteur));

	function ajouterRangee() {
		const r = rangeeVide();
		rangees = [...rangees, r];
		tick().then(() => document.getElementById(`designation-${r.cle}`)?.focus());
	}

	function retirerRangee(cle: number) {
		rangees = rangees.length > 1 ? rangees.filter((r) => r.cle !== cle) : [rangeeVide()];
	}

	function reprendreTiers(nom: string) {
		const connu = tiers.find((t) => t.nom === nom);
		if (connu && tiersAdresse.trim() === '') tiersAdresse = connu.adresse;
	}

	function echec(r: Exclude<Awaited<ReturnType<typeof envoyer>>, { type: 'ok' }>) {
		if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = message('reseau_coupe');
		} else if (r.type === 'serveur') {
			alerte = message('erreur_serveur');
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
			tick().then(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
			tick().then(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
		} else {
			alerte = messageErreur(r.erreur);
		}
	}

	/** Écrit le brouillon. Rend son identifiant, ou rien si le serveur refuse. */
	async function ecrire(): Promise<number | null> {
		alerte = null;
		erreurs = {};
		const corps = saisie();
		const adresse = id === null ? '/api/factures' : `/api/factures/${id}`;
		const r = await envoyer<{ id: number }>(adresse, corps);
		if (r.type !== 'ok') {
			echec(r);
			return null;
		}
		id = r.valeur.id;
		enregistre = JSON.stringify(corps);
		return r.valeur.id;
	}

	async function enregistrer() {
		if (occupe) return;
		occupe = true;
		const nouvelle = id === null;
		const ecrit = await ecrire();
		occupe = false;
		if (ecrit === null) return;
		afficherToast(TEXTES.enregistre);
		if (nouvelle) {
			sortie = true;
			await goto(`/factures/${ecrit}`, { replaceState: true });
		}
	}

	async function demanderValidation() {
		if (occupe) return;
		occupe = true;
		const ecrit = await ecrire();
		if (ecrit === null) {
			occupe = false;
			return;
		}
		const r = await demander<{ numero: string; total: Centimes }>(`/api/factures/${ecrit}`);
		occupe = false;
		if (r.type === 'ok') validation = r.valeur;
		else echec(r);
	}

	async function valider() {
		if (occupe || id === null) return;
		occupe = true;
		const r = await envoyer<{ id: number; numero: string }>(`/api/factures/${id}/valider`);
		occupe = false;
		validation = null;
		if (r.type !== 'ok') {
			echec(r);
			return;
		}
		sortie = true;
		afficherToast(`Facture n° ${r.valeur.numero} validée. La Créance est enregistrée.`);
		await invalidateAll();
		await goto(`/factures/${r.valeur.id}`, { replaceState: true, invalidateAll: true });
	}

	async function supprimer() {
		if (occupe || id === null) return;
		occupe = true;
		const r = await envoyer(`/api/factures/${id}/supprimer`);
		occupe = false;
		confirmerSuppression = false;
		if (r.type !== 'ok') {
			echec(r);
			return;
		}
		sortie = true;
		afficherToast('Brouillon supprimé.');
		await goto('/factures', { invalidateAll: true });
	}

	beforeNavigate((n) => {
		if (sortie || !modifie || n.to === null || n.type === 'leave') return;
		n.cancel();
		quitter = n.to.url.pathname + n.to.url.search;
	});

	function quitterQuandMeme() {
		const cible = quitter;
		sortie = true;
		quitter = null;
		if (cible) goto(cible);
	}
</script>

<a class="retour seulement-ordinateur" href="/factures">
	<ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
	Toutes les Factures
</a>

<EnTete
	titre={facture ? `Brouillon pour ${facture.tiersNom}` : 'Nouvelle facture'}
	contexte="Factures"
	sousTitre="Un brouillon ne porte aucun numéro et ne compte nulle part."
/>

<div class="edition">
	<form
		class="formulaire"
		onsubmit={(e) => {
			e.preventDefault();
			enregistrer();
		}}
	>
		{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}

		<fieldset class="groupe">
			<legend class="t-heading">Destinataire</legend>
			<Champ
				etiquette="Tiers"
				name="tiersNom"
				bind:valeur={tiersNom}
				erreur={erreurs.tiersNom}
				required
				autocomplete="off"
				list="tiers-connus"
				onblur={() => reprendreTiers(tiersNom)}
			/>
			<datalist id="tiers-connus">
				{#each tiers as t (t.nom)}<option value={t.nom}></option>{/each}
			</datalist>
			<ChampZone
				etiquette="Adresse"
				name="tiersAdresse"
				autocomplete="off"
				bind:valeur={tiersAdresse}
				erreur={erreurs.tiersAdresse}
			/>
		</fieldset>

		<fieldset class="groupe deux">
			<legend class="visuellement-cache">Date et Action</legend>
			<Champ
				etiquette="Date d’émission"
				name="dateEmission"
				type="date"
				bind:valeur={dateEmission}
				erreur={erreurs.dateEmission}
			/>
			<SelecteurRecherche
				etiquette="Action"
				id="facture-action"
				options={optionsAction}
				bind:valeur={actionId}
				sansValeur="Sans Action"
				erreur={erreurs.actionId}
			/>
		</fieldset>

		<fieldset class="groupe">
			<legend class="t-heading">Lignes</legend>
			<div class="lignes" role="group" aria-label="Lignes de la facture">
				<div class="tete t-label" aria-hidden="true">
					<span>Désignation</span>
					<span>Quantité</span>
					<span>Prix unitaire</span>
					<span class="droite">Montant</span>
					<span></span>
				</div>
				{#each rangees as r, i (r.cle)}
					<div class="ligne">
						<Champ
							etiquette="Désignation, ligne {i + 1}"
							name="designation-{i}"
							id="designation-{r.cle}"
							masquerEtiquette
							bind:valeur={r.designation}
							erreur={erreurs[`lignes.${i}.designation`]}
							autocomplete="off"
						/>
						<Champ
							etiquette="Quantité, ligne {i + 1}"
							name="quantite-{i}"
							masquerEtiquette
							inputmode="numeric"
							bind:valeur={r.quantite}
							erreur={erreurs[`lignes.${i}.quantite`]}
							autocomplete="off"
						/>
						<ChampMontant
							etiquette="Prix unitaire, ligne {i + 1}"
							name="prix-{i}"
							masquerEtiquette
							bind:valeur={r.prix}
							erreur={erreurs[`lignes.${i}.prixUnitaire`]}
						/>
						<span class="montant">{formaterMontant(montantDe(r))}</span>
						<button
							class="retirer"
							type="button"
							aria-label="Retirer la ligne {i + 1}"
							onclick={() => retirerRangee(r.cle)}
						>
							<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
						</button>
					</div>
				{/each}
			</div>
			<div class="sous-lignes">
				<Bouton variante="discret" onclick={ajouterRangee}>
					<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
					Ajouter une ligne
				</Bouton>
				<p class="total" aria-live="polite">
					<span class="t-label t-muted">Total</span>
					<span class="montant-lg">{formaterMontant(total)}</span>
				</p>
			</div>
		</fieldset>

		{#if !mentions}
			<p class="t-caption t-muted">
				Aucune mention sur la facture pour l’instant. Elles se règlent dans
				<a href="/reglages">Réglages, Association</a>.
			</p>
		{/if}

		<div class="actions">
			<Bouton onclick={demanderValidation} {occupe}>Valider…</Bouton>
			<Bouton variante="secondaire" type="submit" {occupe}>Enregistrer le brouillon</Bouton>
			{#if id !== null}
				<span class="pousse">
					<Bouton variante="discret" onclick={() => (confirmerSuppression = true)}>
						Supprimer le brouillon
					</Bouton>
				</span>
			{/if}
		</div>
	</form>

	<section class="colonne-apercu" aria-label="Aperçu du PDF">
		{#if versionApercu > 0}
			<ApercuPdf src="/factures/apercu?v={versionApercu}" titre="Aperçu de la facture" />
		{/if}
	</section>
</div>

<Dialogue
	ouvert={validation !== null}
	titre="Valider cette facture ?"
	libelleAction="Valider la facture"
	{occupe}
	confirmer={valider}
	revenir={() => (validation = null)}
>
	<p>Elle recevra le n° {validation?.numero} et ne sera plus modifiable.</p>
	<p class="chiffres">
		<span>{tiersNom}</span>
		<span class="montant">{formaterMontant(validation?.total ?? centimes(0))}</span>
	</p>
	<p class="t-muted">Une Créance de ce montant s’ouvre. La recette comptera à l’encaissement.</p>
</Dialogue>

<Dialogue
	ouvert={confirmerSuppression}
	titre="Supprimer ce brouillon ?"
	libelleAction="Supprimer le brouillon"
	libelleRevenir="Garder le brouillon"
	danger
	{occupe}
	confirmer={supprimer}
	revenir={() => (confirmerSuppression = false)}
>
	Il n’a reçu aucun numéro et ne compte nulle part : rien d’autre ne disparaît.
</Dialogue>

<Dialogue
	ouvert={quitter !== null}
	titre={TEXTES.quitter_sans_enregistrer}
	libelleAction="Quitter"
	libelleRevenir="Rester"
	confirmer={quitterQuandMeme}
	revenir={() => (quitter = null)}
>
	Les changements de ce brouillon ne sont pas enregistrés.
</Dialogue>

<style>
	.retour {
		display: inline-flex;
		align-items: center;
		gap: var(--espace-1);
		margin-bottom: var(--espace-1);
		color: var(--ink-muted);
	}

	.edition {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--espace-5);
		margin-top: var(--espace-4);
	}

	.formulaire {
		display: grid;
		gap: var(--espace-4);
		min-width: 0;
	}

	.groupe {
		display: grid;
		gap: var(--espace-3);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.groupe legend {
		margin-bottom: var(--espace-2);
		padding: 0;
	}

	.deux {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
	}

	.lignes {
		display: grid;
		gap: var(--espace-2);
		min-width: 0;
	}

	.tete,
	.ligne {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 112px 96px var(--espace-touch);
		align-items: start;
		gap: var(--espace-2);
	}

	.tete {
		color: var(--ink-muted);
	}

	.droite {
		text-align: right;
	}

	.ligne .montant {
		align-self: center;
		text-align: right;
	}

	.retirer {
		display: inline-grid;
		place-items: center;
		width: var(--espace-touch);
		height: var(--espace-touch);
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

	.sous-lignes {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--espace-3);
	}

	.total {
		display: flex;
		align-items: baseline;
		gap: var(--espace-3);
		margin-inline-start: auto;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--espace-2);
		padding-top: var(--espace-3);
		border-top: 1px solid var(--border);
	}

	.pousse {
		margin-inline-start: auto;
	}

	.colonne-apercu {
		position: sticky;
		top: var(--espace-4);
		min-width: 0;
	}

	.chiffres {
		display: flex;
		justify-content: space-between;
		gap: var(--espace-3);
		margin-block: var(--espace-2);
		padding: var(--espace-2) var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	@media (max-width: 1279.98px) {
		.edition {
			grid-template-columns: minmax(0, 1fr);
		}

		.colonne-apercu {
			position: static;
		}
	}
</style>
