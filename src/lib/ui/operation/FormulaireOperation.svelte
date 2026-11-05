<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { ChevronDown, Ellipsis } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { exerciceDeDate } from '#lib/domaine/etats/soldes.ts';
	import { type Exercice } from '#lib/domaine/exercices.ts';
	import {
		LIBELLES_MODE_PAIEMENT,
		MODES_PAIEMENT,
		type ModePaiement
	} from '#lib/domaine/journal.ts';
	import { centimes, formaterMontant, lireMontant, type Centimes } from '#lib/domaine/montant.ts';
	import { dateProposee } from '#lib/domaine/operations/lecture.ts';
	import type { ContexteSaisie, DetailOperation } from '#lib/domaine/operations/vues.ts';
	import { message, messageErreur, TEXTES, type CodeMessage } from '#lib/messages.ts';
	import { demander, envoyer } from '#lib/ui/api.ts';
	import AideTerme from '#lib/ui/AideTerme.svelte';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import Champ from '#lib/ui/Champ.svelte';
	import ChampListe from '#lib/ui/ChampListe.svelte';
	import ChampMontant from '#lib/ui/ChampMontant.svelte';
	import ChampZone from '#lib/ui/ChampZone.svelte';
	import Dialogue from '#lib/ui/Dialogue.svelte';
	import Menu from '#lib/ui/Menu.svelte';
	import Panneau from '#lib/ui/Panneau.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast } from '#lib/ui/toasts.svelte.ts';
	import Touche from '#lib/ui/Touche.svelte';
	import { urlAvec } from '#lib/ui/url.ts';
	import BlocsOperation from './BlocsOperation.svelte';
	import ResteARepartir from './ResteARepartir.svelte';
	import { nouvelleCle, Saisie, type Choix } from './saisie.svelte.ts';
	import Ventilation from './Ventilation.svelte';
	import VueOperation from './VueOperation.svelte';

	type Props = {
		contexte: ContexteSaisie;
		detail: DetailOperation | null;
		/** Modèle d'une duplication, ou Opération reçue d'un « Rendre cette somme ». */
		modele: DetailOperation | null;
		rendre: boolean;
		introuvable: boolean;
		intention: string | null;
		exerciceRegarde: Exercice | null;
		peutSaisir: boolean;
		fermer: () => void;
	};

	let {
		contexte,
		detail,
		modele,
		rendre,
		introuvable,
		intention,
		exerciceRegarde,
		peutSaisir,
		fermer
	}: Props = $props();

	const ACTIFS: readonly Choix[] = ['depense', 'recette', 'interne'];
	const AUTRES: readonly { choix: Choix; libelle: string }[] = [
		{ choix: 'remboursement', libelle: 'Remboursement d’un fournisseur' },
		{ choix: 'somme', libelle: 'Somme à rendre' },
		{ choix: 'compensee', libelle: 'Opération compensée' }
	];

	/** Hors d'un Exercice ouvert, une date proposée serait aussitôt refusée. */
	function exerciceDeSaisie() {
		if (exerciceRegarde?.statut === 'ouvert') return exerciceRegarde;
		const ouverts = contexte.exercices.filter((e) => e.statut === 'ouvert');
		return ouverts.at(-1) ?? null;
	}

	function compteParDefaut() {
		const actifs = contexte.comptes.filter((c) => c.actif);
		const recent = contexte.recents.comptes.find((id) => actifs.some((c) => c.id === id));
		return recent ?? actifs.find((c) => c.type === 'banque')?.id ?? actifs[0]?.id ?? null;
	}

	function etatInitial(): Saisie {
		const date = dateProposee(contexte.aujourdhui, exerciceDeSaisie());
		const s = new Saisie(date, compteParDefaut());
		const source = detail ?? modele;
		if (source) {
			s.charger(
				source.operation,
				exerciceDeDate(contexte.exercices, source.operation.date)?.id ?? null
			);
		}
		if (detail === null && modele !== null) {
			s.date = date;
			s.parti = date;
			s.arrive = date;
		}
		if (rendre && modele) {
			s.choix = 'somme';
			s.rendDe = modele.operation.id;
			s.libelle = `Rendu : ${modele.operation.libelle}`;
			s.montant = montantTexte(modele.resteARendre ?? centimes(0));
			s.date = date;
		} else if (detail === null && modele === null) {
			const voulue = intention as Choix | null;
			if (voulue && [...ACTIFS, ...AUTRES.map((a) => a.choix)].includes(voulue)) s.choix = voulue;
		}
		return s;
	}

	function montantTexte(c: Centimes) {
		return formaterMontant(c).replace(/\s*€$/, '');
	}

	let saisie = $state.raw(untrack(etatInitial));
	let modifie = $state(false);
	let occupe = $state(false);
	let erreurs = $state<Record<string, string>>({});
	type Alerte = {
		ton: 'erreur' | 'regarder';
		texte: string;
		reessayer?: boolean;
		recharger?: boolean;
	};
	let alerte = $state<Alerte | null>(null);
	let zoneAlerte = $state<HTMLElement | null>(null);
	let zoneReste = $state<HTMLElement | null>(null);
	let confirmerAnnulation = $state(false);
	let relierOuvert = $state(false);
	let dernierEnvoi: (() => Promise<void>) | null = null;

	const estNouvelle = $derived(detail === null);
	const lectureSeule = $derived(
		introuvable || !peutSaisir || (detail !== null && (detail.annulee || detail.figeePar !== null))
	);
	const verrouille = $derived(detail?.pointee ?? false);
	const texteSeul = $derived(detail?.specialisee ?? false);
	const interne = $derived(saisie.choix === 'interne');
	const compensee = $derived(saisie.choix === 'compensee');
	const somme = $derived(saisie.choix === 'somme');
	const ventilee = $derived(!interne && !compensee && !somme);
	const recetteSens = $derived(saisie.choix === 'recette' || saisie.choix === 'remboursement');

	const titre = $derived(
		introuvable ? 'Opération introuvable' : (detail?.operation.libelle ?? 'Nouvelle Opération')
	);

	function options(
		liste: readonly { id: number; libelle: string; actif: boolean }[],
		gardes: readonly (number | null)[]
	): OptionRecherche[] {
		return liste
			.filter((x) => x.actif || gardes.includes(x.id))
			.map(({ id, libelle }) => ({ id, libelle }));
	}

	const idsLignes = $derived(saisie.lignes.map((l) => l.natureId));
	const idsActions = $derived(saisie.lignes.map((l) => l.actionId));
	let naturesCreees = $state<OptionRecherche[]>([]);
	let actionsCreees = $state<OptionRecherche[]>([]);

	const natures = $derived([
		...options(
			contexte.natures.filter((n) => n.codeSysteme === null || idsLignes.includes(n.id)),
			[...idsLignes, saisie.natureFactureId, saisie.natureVentesId]
		),
		...naturesCreees
	]);
	const actions = $derived([
		...options(contexte.actions, [...idsActions, saisie.actionFactureId, saisie.actionVentesId]),
		...actionsCreees
	]);
	const comptes = $derived(
		options(contexte.comptes, [saisie.compteId, saisie.deId, saisie.versId])
	);

	const exerciceDeLaDate = $derived(exerciceDeDate(contexte.exercices, saisie.date));
	const anterieurs = $derived(
		exerciceDeLaDate
			? contexte.exercices.filter((e) => e.anneeDebut < exerciceDeLaDate.anneeDebut)
			: []
	);
	let telephone = $state(false);

	$effect(() => {
		const m = window.matchMedia('(max-width: 639.98px)');
		telephone = m.matches;
		const suivre = () => (telephone = m.matches);
		m.addEventListener('change', suivre);
		return () => m.removeEventListener('change', suivre);
	});

	function choisir(c: Choix) {
		saisie.choix = c;
		modifie = true;
		alerte = null;
		erreurs = {};
		for (const l of saisie.lignes) l.reduction = c === 'remboursement';
	}

	async function creerVolee(chemin: string, libelle: string, liste: OptionRecherche[]) {
		const r = await envoyer<{ id: number; libelle: string }>(chemin, { libelle });
		if (r.type === 'ok') {
			liste.push(r.valeur);
			afficherToast(`${r.valeur.libelle} est créé.`);
			return r.valeur.id;
		}
		traiterEchec(r, () => Promise.resolve());
		return null;
	}

	// Suggestion : préremplit la première Ligne, n'enregistre jamais rien.
	let attente: ReturnType<typeof setTimeout> | undefined;

	function surLibelle() {
		clearTimeout(attente);
		if (!estNouvelle || (saisie.choix !== 'depense' && saisie.choix !== 'recette')) return;
		attente = setTimeout(demanderSuggestion, 200);
	}

	async function demanderSuggestion() {
		const [l] = saisie.lignes;
		if (l === undefined || (l.natureId !== null && l.suggestion === null)) return;
		const q = new URLSearchParams({ libelle: saisie.libelle, intention: saisie.choix });
		const r = await demander<{ natureId: number; actionId: number | null; note: string } | null>(
			`/api/suggestions?${q}`
		);
		if (r.type !== 'ok') return;
		if (r.valeur === null) {
			if (l.suggestion !== null) {
				l.natureId = null;
				l.actionId = null;
				l.suggestion = null;
			}
			return;
		}
		l.natureId = r.valeur.natureId;
		l.actionId = r.valeur.actionId;
		l.suggestion = r.valeur.note;
	}

	type Lu = { ok: true; valeur: Centimes } | { ok: false };

	function montantPositif(texte: string, champ: string, requis = true): Lu {
		const net = texte.trim();
		if (net === '') {
			if (requis) erreurs[champ] = message('champ_requis');
			return { ok: false };
		}
		const r = lireMontant(net);
		if (!r.ok || r.valeur <= 0) {
			erreurs[champ] = message('montant_invalide');
			return { ok: false };
		}
		return { ok: true, valeur: r.valeur };
	}

	const enTete = () => ({
		libelle: saisie.libelle.trim(),
		reference: saisie.reference || null,
		modePaiement: (saisie.modePaiement || null) as ModePaiement | null,
		note: saisie.note || null,
		tiers: saisie.tiers || null
	});

	/** Contrôle ce qui se voit sans le serveur, puis prépare l'envoi. Rien ne sort si un champ manque. */
	function preparer(): Record<string, unknown> | null {
		erreurs = {};
		const requis = (valeur: unknown, champ: string) => {
			if (valeur === null || valeur === '') erreurs[champ] = message('champ_requis');
		};

		if (interne) {
			const m = montantPositif(saisie.montant, 'montant');
			requis(saisie.deId, 'deId');
			requis(saisie.versId, 'versId');
			if (saisie.deId !== null && saisie.deId === saisie.versId) {
				erreurs.versId = 'Choisissez deux Comptes différents.';
			}
			requis(saisie.parti, 'parti');
			requis(saisie.arrive, 'arrive');
			if (!m.ok || Object.keys(erreurs).length > 0) return null;
			const nom = (id: number | null) => contexte.comptes.find((c) => c.id === id)?.libelle ?? '';
			return {
				forme: 'interne',
				libelle:
					saisie.libelle.trim() || `Virement de ${nom(saisie.deId)} vers ${nom(saisie.versId)}`,
				note: saisie.note || null,
				reference: saisie.reference || null,
				deId: saisie.deId,
				versId: saisie.versId,
				montant: m.valeur,
				parti: saisie.parti,
				arrive: saisie.arrive
			};
		}

		requis(saisie.libelle.trim(), 'libelle');
		requis(saisie.compteId, 'compteId');
		requis(saisie.date, 'date');

		if (compensee) {
			const facture = montantPositif(saisie.facture, 'facture');
			const ventes = montantPositif(saisie.ventes, 'ventes');
			requis(saisie.natureFactureId, 'ligneFacture.natureId');
			requis(saisie.natureVentesId, 'ligneVentes.natureId');
			if (!facture.ok || !ventes.ok || Object.keys(erreurs).length > 0) return null;
			return {
				forme: 'compensee',
				...enTete(),
				tiers: saisie.libelle.trim(),
				compteId: saisie.compteId,
				date: saisie.date,
				facture: facture.valeur,
				ventes: ventes.valeur,
				ligneFacture: { natureId: saisie.natureFactureId, actionId: saisie.actionFactureId },
				ligneVentes: { natureId: saisie.natureVentesId, actionId: saisie.actionVentesId }
			};
		}

		const m = montantPositif(saisie.montant, 'montant');

		if (somme) {
			if (!m.ok || Object.keys(erreurs).length > 0) return null;
			return {
				forme: 'standard',
				...enTete(),
				intention: saisie.rendDe === null ? 'recette' : 'depense',
				compteId: saisie.compteId,
				date: saisie.date,
				montant: m.valeur,
				lignes: [
					{
						montant: m.valeur,
						contraire: false,
						reduction: false,
						natureId: contexte.natureSommeARendre,
						actionId: null
					}
				],
				...(saisie.rendDe === null ? {} : { rendDe: saisie.rendDe })
			};
		}

		const lignes = saisie.lignes.map((l, i) => {
			const lu = montantPositif(l.montant, `lignes.${i}.montant`);
			requis(l.natureId, `lignes.${i}.natureId`);
			return {
				montant: lu.ok ? lu.valeur : 0,
				contraire: l.contraire,
				reduction: l.reduction,
				natureId: l.natureId,
				actionId: l.actionId,
				exerciceRattachementId: l.rattachementId,
				note: l.note || null
			};
		});
		if (!m.ok || Object.keys(erreurs).length > 0) return null;

		if (saisie.reste !== 0) {
			const montant = formaterMontant(centimes(Math.abs(saisie.reste)));
			alerte = {
				ton: 'regarder',
				texte: messageErreur({
					code: saisie.reste > 0 ? 'ventilation_incomplete' : 'ventilation_excedent',
					details: { montant }
				})
			};
			zoneReste?.focus();
			return null;
		}

		return {
			forme: 'standard',
			...enTete(),
			intention: recetteSens ? 'recette' : 'depense',
			compteId: saisie.compteId,
			date: saisie.date,
			montant: m.valeur,
			lignes
		};
	}

	function focusPremiereErreur() {
		queueMicrotask(() => {
			const champ = document.querySelector<HTMLElement>('.ape-panneau [aria-invalid="true"]');
			champ?.focus();
		});
	}

	function traiterEchec(
		r: Exclude<Awaited<ReturnType<typeof envoyer>>, { type: 'ok' }>,
		reessayer: () => Promise<void>
	) {
		dernierEnvoi = reessayer;
		if (r.type === 'session') {
			demanderReconnexion();
		} else if (r.type === 'reseau') {
			alerte = { ton: 'regarder', texte: message('reseau_coupe'), reessayer: true };
		} else if (r.type === 'serveur') {
			alerte = { ton: 'erreur', texte: message('erreur_serveur'), reessayer: true };
		} else if (r.erreur.code === 'saisie_invalide') {
			const champs = (r.erreur.details?.champs ?? {}) as Record<string, CodeMessage>;
			erreurs = Object.fromEntries(Object.entries(champs).map(([k, c]) => [k, message(c)]));
			focusPremiereErreur();
		} else if (r.erreur.code === 'modification_concurrente') {
			alerte = { ton: 'regarder', texte: messageErreur(r.erreur), recharger: true };
		} else if (typeof r.erreur.details?.champ === 'string') {
			erreurs = { [r.erreur.details.champ]: messageErreur(r.erreur) };
			focusPremiereErreur();
		} else {
			alerte = { ton: 'erreur', texte: messageErreur(r.erreur) };
		}
		queueMicrotask(() => {
			if (alerte) zoneAlerte?.scrollIntoView({ block: 'nearest' });
		});
	}

	async function envoyerSaisie(continuer: boolean) {
		if (occupe) return;
		alerte = null;
		const corps = preparer();
		if (corps === null) {
			focusPremiereErreur();
			return;
		}
		const lancer = async () => {
			if (occupe) return;
			occupe = true;
			alerte = null;
			const r = detail
				? await envoyer<{ id: number }>(`/api/operations/${detail.operation.id}`, {
						version: detail.operation.version,
						cle: saisie.cle,
						saisie: corps
					})
				: await envoyer<{ id: number }>('/api/operations', { ...corps, cle: saisie.cle });
			occupe = false;
			if (r.type !== 'ok') {
				traiterEchec(r, lancer);
				return;
			}
			afficherToast(TEXTES.enregistre);
			modifie = false;
			if (continuer) {
				const garde = { date: saisie.date, compte: saisie.compteId, choix: saisie.choix };
				saisie = new Saisie(garde.date, garde.compte);
				if (garde.choix !== 'remboursement') saisie.choix = garde.choix;
				erreurs = {};
				await refreshAll();
				document.querySelector<HTMLElement>('.ape-panneau input:not([type=hidden])')?.focus();
			} else {
				fermer();
				await refreshAll();
			}
		};
		await lancer();
	}

	async function annuler() {
		if (detail === null || occupe) return;
		occupe = true;
		const r = await envoyer(`/api/operations/${detail.operation.id}/annuler`);
		occupe = false;
		confirmerAnnulation = false;
		if (r.type === 'ok') {
			afficherToast('Opération annulée.');
			await refreshAll();
		} else {
			traiterEchec(r, annuler);
		}
	}

	async function retrouverOrigine(id: number | null) {
		saisie.origineId = id;
		if (id === null) return;
		const r = await demander<DetailOperation>(`/api/operations/${id}`);
		if (r.type !== 'ok') return;
		const op = r.valeur.operation;
		saisie.compteId = op.cotes[0]?.compteId ?? saisie.compteId;
		saisie.libelle ||= `Remboursement ${op.libelle}`;
		const [plusGrande] = [...op.lignes].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));
		const [l] = saisie.lignes;
		if (l && plusGrande) {
			l.natureId = plusGrande.natureId;
			l.actionId = plusGrande.actionId;
			l.reduction = true;
			l.suggestion = null;
		}
	}

	async function chercherDepenses(texte: string): Promise<OptionRecherche[]> {
		const r = await demander<{ id: number; libelle: string; montant: Centimes }[]>(
			`/api/operations/candidats?q=${encodeURIComponent(texte)}&sens=depense`
		);
		if (r.type !== 'ok') return [];
		return r.valeur.map((o) => ({
			id: o.id,
			libelle: o.libelle,
			detail: formaterMontant(centimes(Math.abs(o.montant)))
		}));
	}

	function surTouche(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !lectureSeule) {
			e.preventDefault();
			envoyerSaisie(false);
		}
	}

	const modes = [
		{ valeur: '', libelle: 'Non précisé' },
		...MODES_PAIEMENT.map((m) => ({ valeur: m, libelle: LIBELLES_MODE_PAIEMENT[m] }))
	];
	const libelleAutre = $derived(AUTRES.find((a) => a.choix === saisie.choix)?.libelle ?? 'Autre');
	const nomAutre = $derived(
		libelleAutre === 'Autre' ? 'Autre intention' : `${libelleAutre}, autre intention`
	);
	const estCheque = $derived(saisie.modePaiement === 'cheque');
	const facture = $derived(lireMontant(saisie.facture));
	const ventes = $derived(lireMontant(saisie.ventes));
	const termesCompensee = $derived([
		{ libelle: 'Facture', montant: facture.ok ? facture.valeur : centimes(0) },
		{
			libelle: 'Ventes encaissées',
			montant: ventes.ok ? ventes.valeur : centimes(0),
			signe: '−' as const
		}
	]);
	const differentielAffiche = $derived(centimes(-saisie.ecart));
	const phraseCompensee = $derived(
		saisie.ecart === 0
			? 'Aucun mouvement sur le Compte : la facture et les ventes s’équilibrent.'
			: saisie.ecart < 0
				? `Seul le différentiel de ${formaterMontant(differentielAffiche)} touche le Compte.`
				: `Seul le différentiel touche le Compte : ${formaterMontant(saisie.ecart)} entrent.`
	);
</script>

{#snippet champMontant()}
	<ChampMontant
		etiquette={saisie.choix === 'remboursement'
			? 'Montant reçu'
			: saisie.rendDe !== null
				? 'Montant rendu'
				: 'Montant'}
		id="op-montant"
		name="montant"
		bind:valeur={saisie.montant}
		erreur={erreurs.montant}
		lectureSeule={verrouille || texteSeul}
		oninput={() => saisie.surMontant()}
		onsortie={() => saisie.surMontant()}
	/>
{/snippet}

{#snippet champDate()}
	<Champ
		etiquette="Date"
		id="op-date"
		name="date"
		type="date"
		bind:valeur={saisie.date}
		erreur={erreurs.date}
		lectureSeule={texteSeul}
	/>
{/snippet}

{#snippet champCompte()}
	<SelecteurRecherche
		etiquette="Compte"
		id="op-compte"
		options={comptes}
		bind:valeur={saisie.compteId}
		recents={contexte.recents.comptes}
		erreur={erreurs.compteId}
		lectureSeule={verrouille || texteSeul}
	>
		{#snippet terme()}<AideTerme ancre="compte">Compte</AideTerme>{/snippet}
	</SelecteurRecherche>
{/snippet}

<Panneau ouvert {titre} {fermer} bind:modifie {surTouche}>
	{#snippet actionsTete()}
		{#if detail && peutSaisir && !detail.annulee}
			<Menu nom="Actions de l’Opération" flottant classe="bouton-tete">
				{#snippet bouton()}<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />{/snippet}
				{#if detail.resteARendre}
					<button
						type="button"
						onclick={() =>
							goto(urlAvec({ op: 'nouvelle', rendre: String(detail?.operation.id) }), {
								reset: false
							})}
					>
						Rendre cette somme
					</button>
				{/if}
				<button
					type="button"
					onclick={() =>
						goto(urlAvec({ op: 'nouvelle', depuis: String(detail?.operation.id) }), {
							reset: false
						})}
				>
					Dupliquer
				</button>
				<button type="button" onclick={() => (relierOuvert = true)}>
					Relier à une autre Opération
				</button>
				{#if !lectureSeule && !detail.specialisee}
					<button type="button" onclick={() => (confirmerAnnulation = true)}>
						Annuler l’Opération
					</button>
				{/if}
			</Menu>
		{/if}
	{/snippet}

	{#if introuvable}
		<Bandeau ton="regarder">{message('element_introuvable')}</Bandeau>
	{:else}
		<div
			class="etats"
			class:garni={alerte ||
				detail?.annulee ||
				detail?.figeePar ||
				detail?.specialisee ||
				detail?.pointee}
			bind:this={zoneAlerte}
		>
			{#if alerte}
				<Bandeau ton={alerte.ton} alerte>
					{alerte.texte}
					{#snippet action()}
						{#if alerte?.reessayer}
							<Bouton variante="secondaire" {occupe} onclick={() => dernierEnvoi?.()}
								>Réessayer</Bouton
							>
						{:else if alerte?.recharger}
							<Bouton
								variante="secondaire"
								onclick={async () => {
									await refreshAll();
									saisie = etatInitial();
									saisie.cle = nouvelleCle();
									alerte = null;
									modifie = false;
								}}
							>
								Recharger
							</Bouton>
						{/if}
					{/snippet}
				</Bandeau>
			{/if}
			{#if detail?.annulee}
				<Bandeau ton="fige">
					Cette Opération est annulée. Elle reste visible ici, et sort de tous les calculs.
				</Bandeau>
			{:else if detail?.figeePar}
				<Bandeau ton="fige">
					{messageErreur({ code: 'exercice_cloture', details: { exercice: detail.figeePar } })}
				</Bandeau>
			{:else if detail?.specialisee && !lectureSeule}
				<Bandeau ton="info">{message('operation_geree_ailleurs')}</Bandeau>
			{:else if detail?.pointee && !lectureSeule}
				<Bandeau ton="info">{message('cote_pointe')}</Bandeau>
			{/if}
		</div>

		{#if lectureSeule && detail}
			<VueOperation
				operation={detail.operation}
				comptes={contexte.comptes}
				natures={contexte.natures}
				actions={contexte.actions}
				exercices={contexte.exercices}
				exerciceCourantId={exerciceDeDate(contexte.exercices, detail.operation.date)?.id ?? null}
			/>
		{:else if !lectureSeule}
			{#if !texteSeul && !verrouille && (estNouvelle || saisie.choix === 'depense' || saisie.choix === 'recette')}
				<div class="intentions" role="group" aria-label="Intention">
					<button
						type="button"
						aria-pressed={saisie.choix === 'depense'}
						onclick={() => choisir('depense')}
					>
						Dépense
					</button>
					<button
						type="button"
						aria-pressed={saisie.choix === 'recette'}
						onclick={() => choisir('recette')}
					>
						Recette
					</button>
					{#if estNouvelle && saisie.rendDe === null}
						<button type="button" aria-pressed={interne} onclick={() => choisir('interne')}>
							Entre Comptes
						</button>
						<Menu
							nom={nomAutre}
							flottant
							classe={libelleAutre === 'Autre' ? 'bouton-autre' : 'bouton-autre choisi'}
						>
							{#snippet bouton()}
								<span>{libelleAutre}</span>
								<ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
							{/snippet}
							{#each AUTRES as a (a.choix)}
								<button type="button" onclick={() => choisir(a.choix)}>{a.libelle}</button>
							{/each}
						</Menu>
					{/if}
				</div>
			{/if}

			<div class="formulaire">
				{#if interne}
					<p class="note-forme t-caption">
						Ne compte ni en recette, ni en dépense.
						<AideTerme ancre="mouvement-interne">Mouvement interne</AideTerme>
					</p>
					<div class="deux">
						<SelecteurRecherche
							etiquette="De"
							id="op-de"
							options={comptes}
							bind:valeur={saisie.deId}
							recents={contexte.recents.comptes}
							erreur={erreurs.deId}
							lectureSeule={verrouille}
						/>
						<SelecteurRecherche
							etiquette="Vers"
							id="op-vers"
							options={comptes}
							bind:valeur={saisie.versId}
							recents={contexte.recents.comptes}
							erreur={erreurs.versId}
							lectureSeule={verrouille}
						/>
					</div>
					{@render champMontant()}
					<div class="deux">
						<Champ
							etiquette="Parti le"
							id="op-parti"
							name="parti"
							type="date"
							bind:valeur={saisie.parti}
							erreur={erreurs.parti ?? erreurs.date}
						/>
						<Champ
							etiquette="Arrivé le"
							id="op-arrive"
							name="arrive"
							type="date"
							bind:valeur={saisie.arrive}
							erreur={erreurs.arrive}
						/>
					</div>
					<Champ
						etiquette="Libellé"
						id="op-libelle"
						name="libelle"
						bind:valeur={saisie.libelle}
						aide="Facultatif : « Virement de CCP vers Livret » par défaut."
						autocomplete="off"
					/>
				{:else if compensee}
					<p class="note-forme t-caption">
						<AideTerme ancre="operation-compensee">Opération compensée</AideTerme> : la facture et les
						ventes comptent pour l’Action, seul le différentiel touche le Compte.
					</p>
					<Champ
						etiquette="Fournisseur"
						id="op-libelle"
						name="libelle"
						bind:valeur={saisie.libelle}
						erreur={erreurs.libelle}
						autocomplete="off"
					/>
					<div class="deux">
						{@render champDate()}
						{@render champCompte()}
					</div>
					<div class="deux">
						<ChampMontant
							etiquette="Facture totale"
							id="op-facture"
							name="facture"
							bind:valeur={saisie.facture}
							erreur={erreurs.facture}
							lectureSeule={verrouille}
						/>
						<ChampMontant
							etiquette="Ventes encaissées par le fournisseur"
							id="op-ventes"
							name="ventes"
							bind:valeur={saisie.ventes}
							erreur={erreurs.ventes}
							lectureSeule={verrouille}
						/>
					</div>
					<div class="pose">
						<CalculPose
							termes={termesCompensee}
							totalLibelle="Différentiel"
							total={differentielAffiche}
						/>
						<p class="t-caption">{phraseCompensee}</p>
					</div>
					<div class="deux">
						<SelecteurRecherche
							etiquette="Nature de la facture"
							id="op-nature-facture"
							options={natures}
							bind:valeur={saisie.natureFactureId}
							recents={contexte.recents.natures}
							erreur={erreurs['ligneFacture.natureId']}
						/>
						<SelecteurRecherche
							etiquette="Action de la facture"
							id="op-action-facture"
							options={actions}
							bind:valeur={saisie.actionFactureId}
							recents={contexte.recents.actions}
							sansValeur="Sans Action"
						/>
						<SelecteurRecherche
							etiquette="Nature des ventes"
							id="op-nature-ventes"
							options={natures}
							bind:valeur={saisie.natureVentesId}
							recents={contexte.recents.natures}
							erreur={erreurs['ligneVentes.natureId']}
						/>
						<SelecteurRecherche
							etiquette="Action des ventes"
							id="op-action-ventes"
							options={actions}
							bind:valeur={saisie.actionVentesId}
							recents={contexte.recents.actions}
							sansValeur="Sans Action"
						/>
					</div>
				{:else}
					{#if saisie.choix === 'remboursement'}
						<SelecteurRecherche
							etiquette="Dépense d’origine"
							id="op-origine"
							options={[]}
							valeur={saisie.origineId}
							chercher={chercherDepenses}
							onchange={retrouverOrigine}
							placeholder="Libellé, référence ou montant"
						/>
					{/if}
					{#if somme && saisie.rendDe === null}
						<p class="note-forme t-caption">
							Reçue puis rendue, elle ne compte ni en recette, ni en dépense.
						</p>
					{/if}
					<div class="trois">
						{#if telephone}
							{@render champDate()}
							{@render champCompte()}
							{@render champMontant()}
						{:else}
							{@render champMontant()}
							{@render champDate()}
							{@render champCompte()}
						{/if}
					</div>
					<Champ
						etiquette="Libellé"
						id="op-libelle"
						name="libelle"
						bind:valeur={saisie.libelle}
						erreur={erreurs.libelle}
						autocomplete="off"
						oninput={surLibelle}
					/>
					{#if !somme}
						<div class="deux">
							<ChampListe
								etiquette="Paiement"
								id="op-modePaiement"
								name="modePaiement"
								options={modes}
								bind:valeur={saisie.modePaiement}
							/>
							<Champ
								etiquette={estCheque ? 'N° de chèque' : 'Référence'}
								id="op-reference"
								name="reference"
								bind:valeur={saisie.reference}
								autocomplete="off"
							/>
						</div>
						{#if estCheque}
							<Champ
								etiquette="Bénéficiaire"
								id="op-tiers"
								name="tiers"
								bind:valeur={saisie.tiers}
								autocomplete="off"
							/>
						{/if}
					{/if}
				{/if}

				{#if ventilee && !texteSeul}
					<section class="repartir" aria-label="Répartir">
						<h3 class="t-heading">Répartir</h3>
						<Ventilation
							{saisie}
							{natures}
							{actions}
							recentsNatures={contexte.recents.natures}
							recentsActions={contexte.recents.actions}
							{anterieurs}
							{erreurs}
							ligneDeRecette={recetteSens}
							creerNature={(t) => creerVolee('/api/natures', t, naturesCreees)}
							creerAction={(t) => creerVolee('/api/actions', t, actionsCreees)}
						/>
					</section>
				{/if}

				<ChampZone etiquette="Note" name="note" id="op-note" lignes={2} bind:valeur={saisie.note} />
			</div>
		{/if}

		{#if detail}
			<BlocsOperation {detail} {peutSaisir} bind:relierOuvert />
		{/if}
	{/if}

	{#snippet avantPied()}
		{#if !lectureSeule && ventilee && !texteSeul && saisie.total !== null}
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
		{#if !lectureSeule}
			<Bouton {occupe} onclick={() => envoyerSaisie(false)}>
				Enregistrer <span class="touches"><Touche>Ctrl</Touche><Touche>Entrée</Touche></span>
			</Bouton>
			{#if estNouvelle}
				<Bouton variante="discret" onclick={() => envoyerSaisie(true)}>
					Enregistrer et continuer
				</Bouton>
			{/if}
		{:else}
			<Bouton variante="secondaire" onclick={fermer}>Fermer</Bouton>
		{/if}
	{/snippet}
</Panneau>

{#if detail}
	<Dialogue
		ouvert={confirmerAnnulation}
		titre="Annuler l’Opération ?"
		libelleAction="Annuler l’Opération"
		libelleRevenir="Garder l’Opération"
		danger
		{occupe}
		confirmer={annuler}
		revenir={() => (confirmerAnnulation = false)}
	>
		« {detail.operation.libelle} » sort des soldes et des états. Elle reste visible, avec son état, et
		le Journal en garde la trace.
	</Dialogue>
{/if}

<style>
	.etats {
		display: grid;
		gap: var(--espace-2);
	}

	.etats.garni {
		margin-bottom: var(--espace-4);
	}

	.intentions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
		margin-bottom: var(--espace-4);
		padding: var(--espace-1);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.intentions > button,
	.intentions :global(.bouton-autre) {
		flex: 1 1 auto;
		min-height: 40px;
		width: auto !important;
		justify-content: center;
		padding: 0 var(--espace-3);
		border: 1px solid transparent;
		border-radius: var(--rayon-sm);
		background: transparent;
		color: var(--ink-muted);
		font: inherit;
		font-weight: var(--typo-label-graisse);
		cursor: pointer;
	}

	.intentions > button:hover,
	.intentions :global(.bouton-autre:hover) {
		color: var(--primary);
	}

	.intentions :global(.bouton-autre.choisi),
	.intentions > button[aria-pressed='true'] {
		border-color: var(--border-strong);
		background: var(--surface-raised);
		color: var(--primary);
	}

	.formulaire {
		display: grid;
		gap: var(--espace-4);
	}

	.trois {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
		gap: var(--espace-3);
		align-items: start;
	}

	.deux {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--espace-3);
		align-items: start;
	}

	.note-forme {
		color: var(--ink-muted);
	}

	.pose {
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
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

	:global(.bouton-tete) {
		justify-content: center;
		width: var(--espace-touch) !important;
		height: var(--espace-touch);
		color: var(--ink-muted);
	}

	:global(.bouton-tete:hover) {
		background: var(--surface-sunken) !important;
	}

	@media (max-width: 639.98px) {
		.trois,
		.deux {
			grid-template-columns: minmax(0, 1fr);
		}

		.intentions > button,
		.intentions :global(.menu) {
			flex: 1 1 calc(50% - var(--espace-1));
		}

		.intentions > button,
		.intentions :global(.bouton-autre) {
			min-height: var(--espace-touch);
		}
	}
</style>
