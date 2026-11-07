<script lang="ts">
	import { afterNavigate, goto, refreshAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { FileUp, Plus, Undo2 } from '@lucide/svelte';
	import { tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { formaterDateCourte, formaterDateLongue, formaterJourMois } from '#lib/domaine/dates.ts';
	import {
		centimes,
		formaterMontant,
		formaterMontantSigne,
		sommeCentimes,
		type Centimes
	} from '#lib/domaine/montant.ts';
	import type { ReglageCsv, TableauCsv } from '#lib/domaine/releve/csv.ts';
	import type { Proposition as VueProposition } from '#lib/domaine/releve/proposer.ts';
	import { bornesTrou } from '#lib/domaine/releve/trous.ts';
	import {
		phraseEcartees,
		phraseRecapitulatif,
		type ComptePointable,
		type ElementRelie,
		type Recapitulatif,
		type VuePointage
	} from '#lib/domaine/releve/vues.ts';
	import { message, messageErreur, TEXTES } from '#lib/messages.ts';
	import { demander, envoyer, envoyerFichier, type Reponse } from '#lib/ui/api.ts';
	import Bandeau from '#lib/ui/Bandeau.svelte';
	import Bouton from '#lib/ui/Bouton.svelte';
	import CalculPose from '#lib/ui/CalculPose.svelte';
	import DepotFichier from '#lib/ui/DepotFichier.svelte';
	import EtatVide from '#lib/ui/EtatVide.svelte';
	import { demanderReconnexion } from '#lib/ui/reconnexion.svelte.ts';
	import ReserveOrdinateur from '#lib/ui/ReserveOrdinateur.svelte';
	import SelecteurRecherche, { type OptionRecherche } from '#lib/ui/SelecteurRecherche.svelte';
	import { afficherToast, retirerToast } from '#lib/ui/toasts.svelte.ts';
	import Touche from '#lib/ui/Touche.svelte';
	import { changerUrl, urlAvec } from '#lib/ui/url.ts';
	import BarreEcart from './BarreEcart.svelte';
	import CausesEcart from './CausesEcart.svelte';
	import CorrespondanceCsv from './CorrespondanceCsv.svelte';
	import LigneReleve from './LigneReleve.svelte';
	import Proposition from './Proposition.svelte';
	import SaisieLigne from './SaisieLigne.svelte';
	import SaisieSolde from './SaisieSolde.svelte';

	type Props = {
		vue: VuePointage;
		compte: ComptePointable;
		comptes: ComptePointable[];
		raccourcis: boolean;
		aujourdhui: string;
		/** Exercice clôturé : file, barre et causes se consultent, rien ne s'y écrit. */
		lectureSeule?: boolean;
	};

	let { vue, compte, comptes, raccourcis, aujourdhui, lectureSeule = false }: Props = $props();

	type Coche = ElementRelie & { coteId: number };
	type Demande = {
		type: 'correspondance';
		tableau: TableauCsv;
		reglage: ReglageCsv;
		colonneAbsente: string | null;
	};

	// La file : les lignes passées avec `p` attendent à la fin des lignes ouvertes.
	let passees = $state<number[]>([]);
	const ouvertes = $derived(vue.lignes.filter((l) => l.etat !== 'pointe'));
	const file = $derived([
		...ouvertes.filter((l) => !passees.includes(l.id)),
		...passees.flatMap((id) => ouvertes.filter((l) => l.id === id)),
		...vue.lignes.filter((l) => l.etat === 'pointe')
	]);

	let activeId = $state<number | null>(
		untrack(() => {
			const voulue = Number(page.url.searchParams.get('ligne'));
			return vue.lignes.find((l) => l.id === voulue)?.id ?? vue.lignes[0]?.id ?? null;
		})
	);
	const active = $derived(file.find((l) => l.id === activeId) ?? file[0] ?? null);
	/** Une ligne pointée ne montre son détail que si on l'a choisie. */
	let choisie = $state(false);

	let selection = $state<number | null>(
		untrack(() => active?.propositions.find((p) => p.preselection)?.coteId ?? null)
	);
	let coches = $state<Coche[]>([]);
	let lignesCochees = $state<number[]>([]);
	let relierOuvert = $state(false);
	let relierValeur = $state<number | null>(null);
	let trouves: Record<number, Coche> = {};
	let occupe = $state(false);
	let alerte = $state<string | null>(null);
	let indication = $state('');
	let attenteCreation = $state<number | null>(null);
	let suivanteCreation: number | null = null;
	let panneauVu = false;

	const selectionnee = $derived(active?.propositions.find((p) => p.coteId === selection) ?? null);
	const elements = $derived<Coche[]>(
		coches.length > 0 ? coches : selectionnee ? [versCoche(selectionnee)] : []
	);
	const decalee = $derived(vue.causes?.decalees[0] ?? null);
	const rienAPointer = $derived(active?.propositions.length === 0 && elements.length === 0);
	const idsLignes = $derived(
		active && !lignesCochees.includes(active.id) ? [...lignesCochees, active.id] : lignesCochees
	);
	const sommeLignes = $derived(
		sommeCentimes(vue.lignes.filter((l) => idsLignes.includes(l.id)).map((l) => l.montant))
	);
	const sommeRelie = $derived(sommeCentimes(elements.map((e) => e.montant)));
	const difference = $derived(centimes(sommeLignes - sommeRelie));
	const plusieurs = $derived(elements.length > 1 || idsLignes.length > 1);
	const montantDifference = $derived(formaterMontant(abs(difference)));

	function abs(c: Centimes) {
		return centimes(Math.abs(c));
	}

	function versCoche(p: VueProposition): Coche {
		return {
			coteId: p.coteId,
			operationId: p.operationId,
			libelle: p.libelle,
			date: p.date,
			montant: p.montant
		};
	}

	function focusActive() {
		document.querySelector<HTMLElement>(`[data-ligne="${activeId}"]`)?.focus();
	}

	// À l'arrivée, la file a le focus : les raccourcis agissent aussitôt. Pas sur téléphone.
	afterNavigate(({ from, to, type }) => {
		const memeEcran = type !== 'enter' && from?.url.pathname === to?.url.pathname;
		const ordinateur = window.matchMedia('(min-width: 640px)').matches;
		if (memeEcran || !ordinateur || page.url.searchParams.has('op')) return;
		setTimeout(focusActive);
	});

	function activer(id: number | null, opts: { garder?: boolean; choix?: boolean } = {}) {
		activeId = id;
		choisie = opts.choix ?? false;
		relierOuvert = false;
		alerte = null;
		indication = '';
		const ligne = vue.lignes.find((l) => l.id === id);
		selection = ligne?.propositions.find((p) => p.preselection)?.coteId ?? null;
		if (!opts.garder && lignesCochees.length === 0) coches = [];
		if (id !== null) replaceState(urlAvec({ ligne: String(id) }), page.state);
	}

	async function aller(sens: number) {
		if (file.length === 0) return;
		const i = file.findIndex((l) => l.id === active?.id);
		const cible = file[Math.min(Math.max(i + sens, 0), file.length - 1)];
		activer(cible?.id ?? null, { choix: true, garder: lignesCochees.length > 0 });
		await tick();
		focusActive();
	}

	function suivanteDe(id: number, retirees: readonly number[] = [id]) {
		const restantes = file.filter((l) => l.etat !== 'pointe');
		const i = restantes.findIndex((l) => l.id === id);
		const apres = restantes.slice(i + 1).find((l) => !retirees.includes(l.id));
		return apres ?? restantes.find((l) => !retirees.includes(l.id)) ?? null;
	}

	function selectionner(coteId: number) {
		selection = selection === coteId ? null : coteId;
		alerte = null;
		indication = '';
	}

	function basculerCoche(c: Coche) {
		coches = coches.some((x) => x.coteId === c.coteId)
			? coches.filter((x) => x.coteId !== c.coteId)
			: [...coches, c];
		alerte = null;
		indication = '';
	}

	function basculerLigne(id: number) {
		lignesCochees = lignesCochees.includes(id)
			? lignesCochees.filter((x) => x !== id)
			: [...lignesCochees, id];
	}

	/** `Espace` : coche la proposition choisie, sinon la ligne, pour relier plusieurs éléments. */
	function espace() {
		if (!active || active.etat !== 'a_pointer') return;
		if (selectionnee) {
			basculerCoche(versCoche(selectionnee));
			selection = null;
		} else {
			basculerLigne(active.id);
		}
	}

	function echecCommun(r: Exclude<Reponse<unknown>, { type: 'ok' }>) {
		if (r.type === 'session') demanderReconnexion();
		else if (r.type === 'reseau') alerte = message('reseau_coupe');
		else if (r.type === 'serveur') alerte = message('erreur_serveur');
		else alerte = messageErreur(r.erreur);
	}

	/** Le toast « Annuler » d'un Pointage : il disparaît dès que ce Pointage n'existe plus. */
	const toastsPointes = new SvelteMap<number, number>();

	function toastPointe(id: number) {
		toastsPointes.set(
			id,
			afficherToast('Pointé.', { libelle: 'Annuler', faire: () => annuler(id) })
		);
	}

	/** Après un Pointage : la ligne se replie, la suivante s'active, la barre se recalcule. */
	async function apresPointage(traitees: readonly number[], depuis: number) {
		const suivante = suivanteDe(depuis, traitees);
		coches = [];
		lignesCochees = [];
		passees = passees.filter((id) => !traitees.includes(id));
		await refreshAll();
		activer(suivante?.id ?? vue.lignes[0]?.id ?? null);
		await tick();
		focusActive();
	}

	async function pointer() {
		// Sur une ligne à regarder, l'action principale du volet est de la garder.
		if (active?.etat === 'a_regarder') return confirmer();
		if (occupe || !active || active.etat !== 'a_pointer') return;
		// Sans proposition, l'action attendue est de créer l'Opération : Entrée la lance.
		if (active.virement && elements.length === 0) return virer();
		if (rienAPointer) {
			creer({ solder: active.sommes[0]?.creanceId });
			return;
		}
		if (elements.length === 0) {
			indication = 'Choisissez une proposition, ou reliez une Opération.';
			return;
		}
		if (difference !== 0) {
			document.querySelector<HTMLElement>('[data-ajustement]')?.focus();
			return;
		}
		occupe = true;
		const depuis = active.id;
		const traitees = idsLignes;
		const r = await envoyer<{ id: number }>('/api/pointage', {
			compteId: compte.id,
			coteIds: elements.map((e) => e.coteId),
			ligneIds: traitees
		});
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		toastPointe(r.valeur.id);
		await apresPointage(traitees, depuis);
	}

	async function ajuster() {
		if (occupe || !active || elements.length === 0) return;
		occupe = true;
		const depuis = active.id;
		const traitees = idsLignes;
		const r = await envoyer<{ id: number }>('/api/pointage/ajustement', {
			compteId: compte.id,
			coteIds: elements.map((e) => e.coteId),
			ligneIds: traitees
		});
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		toastPointe(r.valeur.id);
		await apresPointage(traitees, depuis);
	}

	async function annuler(id: number | null) {
		if (id === null || occupe) return;
		occupe = true;
		const r = await envoyer<{ ajustementsAnnules: number }>(`/api/pointage/annuler/${id}`);
		occupe = false;
		if (r.type === 'ok') {
			const ligne = vue.lignes.find((l) => l.pointageId === id);
			const toast = toastsPointes.get(id);
			if (toast !== undefined) retirerToast(toast);
			toastsPointes.delete(id);
			afficherToast(
				r.valeur.ajustementsAnnules > 0 ? 'Pointage et ajustement annulés.' : 'Pointage annulé.'
			);
			await refreshAll();
			if (ligne) activer(ligne.id);
			await tick();
			focusActive();
		} else if (r.type === 'refus') {
			afficherToast(messageErreur(r.erreur));
		} else {
			echecCommun(r);
		}
	}

	function passer() {
		if (!active || active.etat === 'pointe') return;
		const id = active.id;
		const suivante = suivanteDe(id);
		passees = [...passees.filter((x) => x !== id), id];
		activer(suivante?.id ?? id);
		tick().then(focusActive);
	}

	/** Les deux relevés montrent la même somme : un seul Mouvement, les deux lignes pointées. */
	async function virer() {
		if (occupe || !active?.virement) return;
		occupe = true;
		const depuis = active.id;
		const r = await envoyer<{ id: number }>('/api/pointage/virement', {
			ligneId: depuis,
			autreLigneId: active.virement.ligneId
		});
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		afficherToast('Virement enregistré, les deux lignes sont pointées.');
		await apresPointage([depuis], depuis);
	}

	async function aligner(pointageId: number) {
		if (occupe) return;
		occupe = true;
		const r = await envoyer(`/api/pointage/aligner/${pointageId}`);
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		afficherToast('Date corrigée.');
		await refreshAll();
		if (vue.causes === null || vue.causes.ecart === 0) fermerCauses();
	}

	function creer(options: { sumup?: boolean; solder?: number } = {}) {
		if (!active || active.etat !== 'a_pointer') return;
		if (active.horsExercice) {
			alerte = message('ligne_hors_exercice');
			return;
		}
		attenteCreation = active.id;
		suivanteCreation = suivanteDe(active.id)?.id ?? null;
		goto(
			urlAvec({
				op: 'nouvelle',
				releve: String(active.id),
				sumup: options.sumup ? '1' : null,
				solder: options.solder ? String(options.solder) : null,
				depuis: null,
				rendre: null
			}),
			{ reset: false }
		);
	}

	// Opération et Pointage enregistrés dans le panneau : la ligne suivante s'active.
	$effect(() => {
		if (attenteCreation === null) return;
		const ligne = vue.lignes.find((l) => l.id === attenteCreation);
		if (ligne?.etat === 'pointe') {
			const id = ligne.id;
			const pointage = ligne.pointageId;
			attenteCreation = null;
			panneauVu = false;
			untrack(() => {
				passees = passees.filter((x) => x !== id);
				activer(suivanteCreation ?? vue.lignes[0]?.id ?? null);
				if (pointage !== null) toastPointe(pointage);
				// Le panneau rend le focus en se fermant : la file le reprend ensuite.
				setTimeout(focusActive, 120);
			});
		} else if (page.url.searchParams.has('op')) {
			panneauVu = true;
		} else if (panneauVu) {
			// Refermé sans enregistrer : la ligne reste active.
			panneauVu = false;
			attenteCreation = null;
			setTimeout(focusActive, 120);
		}
	});

	/** Un `r` lancé par erreur se défait d'une touche, et les raccourcis reviennent à la file. */
	function surToucheRelier(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		relierOuvert = false;
		tick().then(focusActive);
	}

	function ouvrirRelier() {
		if (!active || active.etat !== 'a_pointer') return;
		relierValeur = null;
		relierOuvert = true;
		tick().then(() => document.getElementById('relier-ligne')?.focus());
	}

	async function chercherCotes(texte: string): Promise<OptionRecherche[]> {
		const r = await demander<Coche[]>(
			`/api/pointage/comptes/${compte.id}/candidats?q=${encodeURIComponent(texte)}`
		);
		if (r.type !== 'ok') return [];
		trouves = Object.fromEntries(r.valeur.map((c) => [c.coteId, c]));
		return r.valeur.map((c) => ({
			id: c.coteId,
			libelle: c.libelle,
			detail: `${formaterDateCourte(c.date)}, ${formaterMontantSigne(c.montant)}`
		}));
	}

	function relierChoisi(id: number | null) {
		const c = id === null ? undefined : trouves[id];
		if (c === undefined) return;
		const preselection = selectionnee ? versCoche(selectionnee) : null;
		coches = [
			...coches,
			...(preselection && !coches.some((x) => x.coteId === preselection.coteId)
				? [preselection]
				: []),
			...(coches.some((x) => x.coteId === c.coteId) ? [] : [c])
		];
		selection = null;
		relierOuvert = false;
		indication = '';
		tick().then(focusActive);
	}

	async function confirmer() {
		if (!active || occupe) return;
		const id = active.id;
		occupe = true;
		const r = await envoyer(`/api/pointage/lignes/${id}/confirmer`);
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		afficherToast('Ligne gardée.');
		await refreshAll();
		activer(id);
		tick().then(focusActive);
	}

	/** Un montant démesuré n'est dans aucune file : il se retire depuis son bandeau. */
	async function retirerDemesure(type: 'lignes' | 'constats', id: number) {
		if (occupe) return;
		occupe = true;
		const r = await envoyer(`/api/pointage/${type}/${id}/retirer`);
		occupe = false;
		if (r.type === 'ok') {
			afficherToast('Retiré du relevé.');
			await refreshAll();
		} else if (r.type === 'refus') {
			afficherToast(messageErreur(r.erreur));
		} else {
			echecCommun(r);
		}
	}

	async function retirer() {
		if (!active || occupe) return;
		const id = active.id;
		const suivante = suivanteDe(id);
		occupe = true;
		const r = await envoyer(`/api/pointage/lignes/${id}/retirer`);
		occupe = false;
		if (r.type !== 'ok') {
			echecCommun(r);
			return;
		}
		afficherToast('Ligne écartée.');
		await refreshAll();
		activer(suivante?.id ?? vue.lignes[0]?.id ?? null);
		tick().then(focusActive);
	}

	function dansUnChamp(e: HTMLElement) {
		return e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName);
	}

	/** Les raccourcis lisent le caractère produit, et se taisent pendant une saisie. */
	function surTouche(e: KeyboardEvent) {
		const cible = e.target as HTMLElement;
		if (lectureSeule) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				aller(e.key === 'ArrowDown' ? 1 : -1);
			}
			return;
		}
		// Sur une case « Relier aussi », Entrée pointe comme depuis la file. Espace la coche.
		if (e.key === 'Enter' && cible.matches('input[type=checkbox]')) {
			e.preventDefault();
			pointer();
			return;
		}
		if (dansUnChamp(cible) || e.altKey) return;
		const ctrl = e.ctrlKey || e.metaKey;
		if (ctrl) {
			if (e.key.toLowerCase() === 'z') {
				e.preventDefault();
				annuler(vue.dernierPointageId);
			}
			return;
		}
		const bouton = cible.closest('a, button');
		const autreBouton = bouton && !bouton.matches('[data-ligne], [data-proposition]');

		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			aller(e.key === 'ArrowDown' ? 1 : -1);
		} else if (e.key === 'Enter' && !autreBouton) {
			e.preventDefault();
			pointer();
		} else if (e.key === ' ' && !autreBouton) {
			e.preventDefault();
			espace();
		} else if (raccourcis) {
			lettre(e);
		}
	}

	function lettre(e: KeyboardEvent) {
		const rang = ['1', '2', '3'].indexOf(e.key);
		if (rang >= 0) {
			const p = active?.propositions[rang];
			if (p) selection = p.coteId;
			alerte = null;
			return;
		}
		const actions: Record<string, () => void> = {
			j: () => aller(1),
			k: () => aller(-1),
			p: passer,
			c: () => creer(),
			r: ouvrirRelier
		};
		const action = actions[e.key];
		if (action) {
			e.preventDefault();
			action();
		}
	}

	// Import : un fichier à la fois, dans l'ordre du dépôt.
	let attente = $state<File[]>([]);
	let importEnCours = $state(false);
	let recapitulatifs = $state<{ nom: string; r: Recapitulatif }[]>([]);
	let erreurImport = $state<{
		texte: string;
		reessayer: boolean;
		fichier?: File;
	} | null>(null);
	let correspondance = $state<{ fichier: File; demande: Demande; erreur: string | null } | null>(
		null
	);
	let glisse = $state(0);
	let dateSolde = $state<string | null>(null);

	async function lireFichier(
		fichier: File,
		reglage?: ReglageCsv,
		autreCompte = false
	): Promise<'suite' | 'stop'> {
		const corps = new FormData();
		corps.set('fichier', fichier);
		if (reglage) corps.set('reglage', JSON.stringify(reglage));
		if (autreCompte) corps.set('autreCompte', '1');
		const r = await envoyerFichier<Recapitulatif | Demande>(
			`/api/pointage/comptes/${compte.id}/import`,
			corps
		);
		if (r.type === 'ok') {
			const v = r.valeur;
			if (v.type === 'correspondance') {
				correspondance = { fichier, demande: v, erreur: null };
				return 'stop';
			}
			recapitulatifs = [{ nom: fichier.name, r: v }, ...recapitulatifs];
			if (v.soldeDemande) dateSolde = v.soldeDemande.date;
			return 'suite';
		}
		if (r.type === 'session') {
			demanderReconnexion();
			return 'stop';
		}
		if (r.type === 'refus') {
			if (correspondance) correspondance.erreur = messageErreur(r.erreur);
			else {
				erreurImport = {
					texte: messageErreur(r.erreur),
					reessayer: false,
					...(r.erreur.code === 'releve_autre_compte' ? { fichier } : {})
				};
			}
			return correspondance ? 'stop' : 'suite';
		}
		erreurImport = {
			texte: message(r.type === 'reseau' ? 'reseau_coupe' : 'erreur_serveur'),
			reessayer: true
		};
		return 'stop';
	}

	async function derouler() {
		if (importEnCours) return;
		importEnCours = true;
		erreurImport = null;
		while (attente.length > 0) {
			const [fichier] = attente;
			if (fichier === undefined || (await lireFichier(fichier)) === 'stop') break;
			attente = attente.slice(1);
		}
		importEnCours = false;
		await apresImport();
	}

	async function importerQuandMeme() {
		const fichier = erreurImport?.fichier;
		if (fichier === undefined || importEnCours) return;
		erreurImport = null;
		importEnCours = true;
		await lireFichier(fichier, undefined, true);
		importEnCours = false;
		await apresImport();
	}

	async function apresImport() {
		dateSoldeAffichee();
		await refreshAll();
		// Une ligne déjà pointée n'a plus rien à dire : on reprend à la première à traiter.
		const courante = vue.lignes.find((l) => l.id === activeId);
		if (courante === undefined || courante.etat === 'pointe') {
			activer(vue.lignes[0]?.id ?? null);
		} else if (active) {
			activer(active.id);
		}
		// Le récapitulatif lu, Entrée pointe aussitôt (UJ-1). Un solde demandé garde le focus.
		if (erreurImport === null && dateSolde === null && correspondance === null) {
			await tick();
			focusActive();
		}
	}

	/** Un fichier sans solde : le solde se demande tout de suite. */
	function dateSoldeAffichee() {
		if (dateSolde !== null && attente.length === 0 && correspondance === null) {
			changerUrl({ saisir: 'solde' });
		}
	}

	function deposer(fichiers: File[]) {
		attente = [...attente, ...fichiers];
		recapitulatifs = [];
		derouler();
	}

	async function validerCorrespondance(reglage: ReglageCsv) {
		if (correspondance === null || importEnCours) return;
		importEnCours = true;
		correspondance.erreur = null;
		const fichier = correspondance.fichier;
		const issue = await lireFichier(fichier, reglage);
		importEnCours = false;
		if (issue === 'suite' || correspondance?.erreur === null) {
			correspondance = null;
			attente = attente.slice(1);
			await derouler();
		}
	}

	function laisserFichier() {
		correspondance = null;
		attente = attente.slice(1);
		derouler();
	}

	const avecFichiers = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

	function surEntreeGlisse(e: DragEvent) {
		if (avecFichiers(e)) glisse += 1;
	}

	function surDepotPage(e: DragEvent) {
		if (!avecFichiers(e)) return;
		e.preventDefault();
		glisse = 0;
		deposer([...(e.dataTransfer?.files ?? [])]);
	}

	function surCollage(e: ClipboardEvent) {
		const fichiers = [...(e.clipboardData?.files ?? [])];
		if (fichiers.length > 0 && !page.url.searchParams.has('op')) {
			e.preventDefault();
			deposer(fichiers);
		}
	}

	const q = $derived(page.url.searchParams);
	const reste = $derived(ouvertes.length);
	const aConfirmer = $derived(ouvertes.some((l) => l.etat === 'a_regarder' && l.jumelle));
	const fin = $derived(vue.lignes.length > 0 && reste === 0);
	const montrerDetail = $derived(active?.etat === 'pointe' && choisie);
	const derniereDate = $derived(
		vue.lignes
			.map((l) => l.date)
			.sort()
			.at(-1) ?? aujourdhui
	);

	const fermerCauses = () => changerUrl({ causes: null });
	const fermerSaisie = () => {
		dateSolde = null;
		return changerUrl({ saisir: null, cote: null })
			.then(() => tick())
			.then(focusActive);
	};
</script>

<svelte:window
	ondragenter={surEntreeGlisse}
	ondragleave={(e) => {
		if (avecFichiers(e)) glisse = Math.max(0, glisse - 1);
	}}
	ondragover={(e) => {
		if (avecFichiers(e)) e.preventDefault();
	}}
	ondrop={surDepotPage}
	onpaste={surCollage}
/>

{#snippet aucunReleve()}
	<EtatVide
		icone={FileUp}
		titre="Aucun relevé pour ce Compte"
		phrase="Déposez ici le fichier OFX ou CSV téléchargé depuis votre banque."
	/>
{/snippet}

<div class="page">
	<BarreEcart
		barre={vue.barre}
		{compte}
		{comptes}
		peutAgir={!lectureSeule}
		causes={() => changerUrl({ causes: '1' })}
		indiquerSolde={() => changerUrl({ saisir: 'solde' })}
	/>

	<ReserveOrdinateur />

	<div class="annonces seulement-ordinateur">
		{#if !lectureSeule}
			{#each vue.demesures.lignes as l (l.id)}
				<Bandeau ton="erreur">
					{message('ligne_demesuree', { libelle: l.libelle, date: formaterDateCourte(l.date) })}
					{#snippet action()}
						<Bouton variante="secondaire" {occupe} onclick={() => retirerDemesure('lignes', l.id)}>
							Retirer cette ligne
						</Bouton>
					{/snippet}
				</Bandeau>
			{/each}
			{#each vue.demesures.constats as c (c.id)}
				<Bandeau ton="erreur">
					{message('solde_demesure', { date: formaterDateCourte(c.date) })}
					{#snippet action()}
						<Bouton
							variante="secondaire"
							{occupe}
							onclick={() => retirerDemesure('constats', c.id)}
						>
							Retirer ce solde
						</Bouton>
					{/snippet}
				</Bandeau>
			{/each}
		{/if}
		{#if erreurImport}
			<Bandeau ton={erreurImport.reessayer ? 'regarder' : 'erreur'} alerte>
				{erreurImport.texte}
				{#snippet action()}
					{#if erreurImport?.reessayer}
						<Bouton variante="secondaire" onclick={derouler}>Réessayer</Bouton>
					{:else if erreurImport?.fichier}
						<Bouton variante="secondaire" onclick={importerQuandMeme}>Importer quand même</Bouton>
					{/if}
				{/snippet}
			</Bandeau>
		{/if}
		{#each recapitulatifs as { nom, r } (nom)}
			<Bandeau ton="info">
				{#if recapitulatifs.length > 1}<strong>{nom} :</strong>{/if}
				{r.nouvelles === 0 && r.lues > 0 ? message('fichier_connu') : phraseRecapitulatif(r)}
				{#if r.ecartees > 0}{phraseEcartees(r.ecartees)}{/if}
				{#if r.soldeIgnore}{TEXTES.solde_ignore}{/if}
			</Bandeau>
			{#if r.identifiantsRepetes > 0}
				<Bandeau ton="regarder">
					{message('identifiant_repete', {
						lignes:
							r.identifiantsRepetes > 1
								? `${r.identifiantsRepetes} lignes reprennent`
								: 'Une ligne reprend'
					})}
				</Bandeau>
			{/if}
		{/each}
		{#if aConfirmer && !lectureSeule}
			<Bandeau ton="regarder">{message('doublon_possible')}</Bandeau>
		{/if}
		{#if vue.trou}
			<Bandeau ton="regarder">{message('trou_de_dates', bornesTrou(vue.trou))}</Bandeau>
		{/if}
	</div>

	{#if vue.lignes.length === 0}
		<div class={lectureSeule ? '' : 'seulement-telephone'}>{@render aucunReleve()}</div>
		{#if !lectureSeule}
			<div class="seulement-ordinateur">
				<DepotFichier {deposer} occupe={importEnCours} accepte=".ofx,.csv,.txt,.tsv">
					{@render aucunReleve()}
					{#snippet autres()}
						<Bouton variante="secondaire" onclick={() => changerUrl({ saisir: 'ligne' })}>
							Saisir une ligne
						</Bouton>
					{/snippet}
				</DepotFichier>
			</div>
		{/if}
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="travail" onkeydown={surTouche}>
			<section class="colonne-file" aria-label="File du relevé">
				<ol class="file">
					{#each file as l (l.id)}
						<LigneReleve
							ligne={l}
							active={l.id === active?.id}
							surlignee={l.id === active?.id &&
								(lectureSeule ? montrerDetail : !fin || montrerDetail)}
							cochee={lignesCochees.includes(l.id)}
							peutAgir={!lectureSeule}
							activer={() => activer(l.id, { choix: true })}
							cocher={() => basculerLigne(l.id)}
						/>
					{/each}
				</ol>
				{#if !lectureSeule}
					<div class="pied-file seulement-ordinateur">
						<DepotFichier
							compact
							{deposer}
							occupe={importEnCours}
							accepte=".ofx,.csv,.txt,.tsv"
							libelleBouton="Importer un relevé"
						/>
						<Bouton variante="discret" onclick={() => changerUrl({ saisir: 'ligne' })}>
							<Plus size={20} strokeWidth={1.75} aria-hidden="true" />
							Saisir une ligne
						</Bouton>
					</div>
				{/if}
			</section>

			<section class="volet seulement-ordinateur" aria-label="Ligne active">
				{#if lectureSeule && !montrerDetail}
					<div class="fin">
						<h2 class="t-heading">Ce relevé se consulte</h2>
						<p class="t-muted">
							Pour pointer une ligne, revenez à un Exercice ouvert. Une ligne pointée montre ici ce
							qui la relie.
						</p>
					</div>
				{:else if fin && !montrerDetail}
					<div class="fin">
						{#if vue.barre.ecart === 0}
							<h2 class="t-title">{TEXTES.tout_pointe}</h2>
							{#if vue.barre.dateReleve}
								<p>
									{message('solde_egal_releve', {
										date: formaterJourMois(vue.barre.dateReleve)
									})}
								</p>
							{/if}
							<div class="pose">
								<CalculPose
									termes={[
										{ libelle: 'Solde de départ', montant: vue.barre.depart },
										{
											libelle: 'Mouvements',
											montant: abs(vue.barre.mouvements),
											signe: vue.barre.mouvements < 0 ? '−' : '+'
										}
									]}
									totalLibelle="Solde calculé"
									total={vue.barre.calcule}
								/>
							</div>
							<Bouton href="/">Retour au Tableau de contrôle</Bouton>
						{:else if vue.barre.ecart === null}
							<h2 class="t-title">Toutes les lignes sont traitées.</h2>
							<p>Indiquez le solde de votre relevé pour contrôler le calcul, au centime.</p>
							<Bouton onclick={() => changerUrl({ saisir: 'solde' })}>Indiquer le solde</Bouton>
						{:else}
							<h2 class="t-title">
								{message('lignes_traitees_ecart', {
									montant: formaterMontant(abs(vue.barre.ecart))
								})}
							</h2>
							{#if decalee}
								<p>
									{message('date_decalee', {
										libelle: decalee.libelle,
										dateCote: formaterDateCourte(decalee.dateCote),
										dateReleve: formaterDateCourte(decalee.dateReleve)
									})}
								</p>
								{#if !lectureSeule}
									<Bouton {occupe} onclick={() => decalee && aligner(decalee.pointageId)}>
										Mettre au {formaterDateCourte(decalee.dateReleve)}
									</Bouton>
								{/if}
							{/if}
							<Bouton
								variante={decalee ? 'secondaire' : 'principal'}
								onclick={() => changerUrl({ causes: '1' })}>Voir les causes</Bouton
							>
						{/if}
					</div>
				{:else if active}
					<header class="tete-volet">
						<h2 class="t-heading">{active.libelle}</h2>
						<p class="t-muted">
							{formaterDateLongue(active.date)}
							<span class="montant">· {formaterMontantSigne(active.montant)}</span>
						</p>
					</header>

					{#if alerte}<Bandeau ton="erreur" alerte>{alerte}</Bandeau>{/if}

					{#if active.etat === 'pointe'}
						<h3 class="t-label sous-titre">Relié à</h3>
						<ul class="relies">
							{#each active.relies as e (e.operationId)}
								<li>
									<a href={urlAvec({ op: String(e.operationId) })} data-sveltekit-reset="false"
										>{e.libelle}</a
									>
									<span class="t-caption t-muted">{formaterDateCourte(e.date)}</span>
									<span class="montant">{formaterMontantSigne(e.montant)}</span>
								</li>
							{/each}
						</ul>
						{#if !lectureSeule}
							<div class="actions">
								<Bouton
									variante="secondaire"
									{occupe}
									onclick={() => annuler(active?.pointageId ?? null)}
								>
									<Undo2 size={20} strokeWidth={1.75} aria-hidden="true" />
									Annuler le Pointage
								</Bouton>
							</div>
						{/if}
					{:else if active.etat === 'a_regarder'}
						<Bandeau ton="regarder">
							{message(active.jumelle ? 'doublon_a_confirmer' : 'ligne_identifiant_repete')}
						</Bandeau>
						<div class="actions">
							<Bouton {occupe} onclick={confirmer}>
								Garder cette ligne <Touche>Entrée</Touche>
							</Bouton>
							<Bouton variante="secondaire" {occupe} onclick={retirer}>Écarter cette ligne</Bouton>
							<Bouton variante="discret" onclick={passer}>Passer <Touche>p</Touche></Bouton>
						</div>
					{:else}
						{#if active.chequeAbsent}
							<Bandeau ton="regarder">
								{message(active.chequeAnnule ? 'cheque_annule_en_banque' : 'cheque_absent', {
									numero: active.chequeAbsent
								})}
							</Bandeau>
						{/if}
						{#if active.sumup}
							<Bandeau ton="info">
								{message('versement_sumup')}
								{#snippet action()}
									<Bouton variante="secondaire" onclick={() => creer({ sumup: true })}>
										Répartir brut et frais
									</Bouton>
								{/snippet}
							</Bandeau>
						{/if}
						{#if active.sommes.length > 0}
							<h3 class="t-label sous-titre">
								{active.montant > 0 ? 'Créance ouverte' : 'Dette ouverte'}
							</h3>
							<ul class="sommes">
								{#each active.sommes as s, i (s.creanceId)}
									<li>
										<div class="somme">
											<p class="nom-somme">{s.tiers}, {s.motif}</p>
											<p class="t-caption t-muted">{s.raison}</p>
										</div>
										<span class="montant">{formaterMontant(s.reste)}</span>
										<Bouton
											variante={rienAPointer && i === 0 ? 'principal' : 'secondaire'}
											onclick={() => creer({ solder: s.creanceId })}
										>
											Créer et solder
										</Bouton>
									</li>
								{/each}
							</ul>
						{/if}
						{#if active.virement}
							<h3 class="t-label sous-titre">Virement entre Comptes</h3>
							<div class="virement">
								<p class="nom-virement">
									Virement {active.virement.sens === 'depuis' ? 'depuis' : 'vers'}
									{active.virement.compteLibelle}
								</p>
								<p class="t-caption t-muted">
									{message('virement_croise', {
										compte: active.virement.compteLibelle,
										date: formaterDateCourte(active.virement.date)
									})}
								</p>
							</div>
						{/if}
						{#if active.propositions.length > 0}
							<h3 class="t-label sous-titre">Propositions</h3>
							<ol class="propositions">
								{#each active.propositions as p, i (p.coteId)}
									<Proposition
										proposition={p}
										rang={i + 1}
										selectionnee={selection === p.coteId}
										cochee={coches.some((c) => c.coteId === p.coteId)}
										selectionner={() => selectionner(p.coteId)}
										cocher={() => basculerCoche(versCoche(p))}
									/>
								{/each}
							</ol>
						{:else if !active.chequeAbsent && active.sommes.length === 0 && !active.virement}
							<p class="t-muted">Aucune Opération ne correspond. Créez-la, ou reliez-en une.</p>
						{/if}

						{#if coches.some((c) => !active?.propositions.some((p) => p.coteId === c.coteId))}
							<h3 class="t-label sous-titre">Reliées</h3>
							<ul class="relies">
								{#each coches.filter((c) => !active?.propositions.some((p) => p.coteId === c.coteId)) as c (c.coteId)}
									<li>
										<span>{c.libelle}</span>
										<span class="t-caption t-muted">{formaterDateCourte(c.date)}</span>
										<span class="montant">{formaterMontantSigne(c.montant)}</span>
									</li>
								{/each}
							</ul>
						{/if}

						{#if relierOuvert}
							<div onkeydowncapture={surToucheRelier} role="presentation">
								<SelecteurRecherche
									etiquette="Opération à relier"
									id="relier-ligne"
									options={[]}
									bind:valeur={relierValeur}
									chercher={chercherCotes}
									listerAOuverture
									onchange={relierChoisi}
									placeholder="Libellé, référence ou montant"
								/>
							</div>
						{/if}

						{#if elements.length > 0 && (plusieurs || difference !== 0)}
							<div class="pose" aria-live="polite">
								<CalculPose
									termes={[
										{
											libelle: idsLignes.length > 1 ? 'Lignes de relevé' : 'Ligne de relevé',
											montant: abs(sommeLignes)
										},
										{ libelle: 'Relié', montant: abs(sommeRelie), signe: '−' }
									]}
									totalLibelle="Différence"
									total={abs(difference)}
								/>
							</div>
						{/if}

						{#if elements.length > 0 && difference !== 0}
							<Bandeau ton="regarder">
								{message('pointage_desequilibre', { montant: montantDifference })}
								{#snippet action()}
									<Bouton variante="secondaire" {occupe} data-ajustement onclick={ajuster}>
										Créer un ajustement de {montantDifference}
									</Bouton>
								{/snippet}
							</Bandeau>
						{/if}

						{#if indication}<p class="indication t-caption" role="status">{indication}</p>{/if}

						<div class="actions">
							{#if active.virement && elements.length === 0}
								<Bouton {occupe} onclick={virer}>
									Enregistrer le virement <Touche>Entrée</Touche>
								</Bouton>
								<Bouton variante="secondaire" onclick={() => creer()}>
									Créer <Touche>c</Touche>
								</Bouton>
							{:else if rienAPointer && active.sommes.length > 0}
								<Bouton variante="secondaire" onclick={() => creer()}>
									Créer sans solder <Touche>c</Touche>
								</Bouton>
							{:else if rienAPointer}
								<Bouton onclick={() => creer()}>Créer <Touche>Entrée</Touche></Bouton>
							{:else}
								<Bouton {occupe} onclick={pointer}>Pointer <Touche>Entrée</Touche></Bouton>
								<Bouton variante="secondaire" onclick={() => creer()}>
									Créer <Touche>c</Touche>
								</Bouton>
							{/if}
							<Bouton variante="secondaire" onclick={ouvrirRelier}>
								Relier <Touche>r</Touche>
							</Bouton>
							<Bouton variante="discret" onclick={passer}>Passer <Touche>p</Touche></Bouton>
						</div>
					{/if}

					{#if active.manuelle && active.etat !== 'pointe'}
						<p class="retrait">
							<Bouton variante="discret" {occupe} onclick={retirer}>
								Supprimer cette ligne saisie
							</Bouton>
						</p>
					{/if}
				{/if}
			</section>
		</div>
	{/if}

	{#if vue.sansLigne.length > 0}
		<section class="sans-ligne seulement-ordinateur" aria-labelledby="titre-sans-ligne">
			<h2 id="titre-sans-ligne" class="t-heading">
				{vue.sansLigne.length > 1
					? `${vue.sansLigne.length} Opérations attendent leur ligne de relevé`
					: 'Une Opération attend sa ligne de relevé'}
			</h2>
			<p class="t-muted">
				Aucune ligne importée ne leur correspond. Si elles figurent sur votre relevé, recopiez la
				ligne : elle se pointera ensuite comme les autres.
			</p>
			<ul>
				{#each vue.sansLigne as o (o.coteId)}
					<li>
						<span class="t-caption">{formaterDateCourte(o.date)}</span>
						<a href="/operations?op={o.operationId}">{o.libelle}</a>
						<span class="montant">{formaterMontantSigne(o.montant)}</span>
						{#if !lectureSeule}
							<Bouton
								variante="secondaire"
								onclick={() => changerUrl({ saisir: 'ligne', cote: String(o.coteId) })}
							>
								Recopier du relevé
							</Bouton>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if glisse > 0}
	<div class="voile-depot" aria-hidden="true">
		<FileUp size={40} strokeWidth={1.75} />
		<p class="t-title">Déposez votre relevé</p>
	</div>
{/if}

{#if q.has('causes') && vue.causes}
	<CausesEcart
		causes={vue.causes}
		fermer={fermerCauses}
		aligner={lectureSeule ? undefined : aligner}
	/>
{/if}

{#if lectureSeule}
	<!-- Rien ne s'écrit sur un Exercice clôturé, même par une URL gardée. -->
{:else if q.get('saisir') === 'ligne'}
	{@const recopie = vue.sansLigne.find((o) => String(o.coteId) === q.get('cote')) ?? null}
	<SaisieLigne
		compteId={compte.id}
		dateProposee={recopie?.date ?? aujourdhui}
		depuis={recopie}
		fermer={fermerSaisie}
		apres={async () => {
			await refreshAll();
			// Recopiée d'une Opération : la nouvelle ligne s'ouvre, sa proposition prête à pointer.
			const nouvelle = recopie
				? vue.lignes.filter((l) => l.manuelle && l.etat === 'a_pointer').at(-1)
				: undefined;
			if (nouvelle) activer(nouvelle.id);
			else if (activeId === null) activer(vue.lignes[0]?.id ?? null);
			afficherToast('Ligne ajoutée.');
		}}
	/>
{:else if q.get('saisir') === 'solde'}
	<SaisieSolde
		compteId={compte.id}
		dateProposee={dateSolde ?? vue.barre.dateReleve ?? derniereDate}
		fermer={fermerSaisie}
		apres={async () => {
			await refreshAll();
			afficherToast('Solde enregistré.');
		}}
	/>
{/if}

{#if correspondance}
	<CorrespondanceCsv
		nomFichier={correspondance.fichier.name}
		tableau={correspondance.demande.tableau}
		reglage={correspondance.demande.reglage}
		colonneAbsente={correspondance.demande.colonneAbsente}
		erreur={correspondance.erreur}
		occupe={importEnCours}
		valider={validerCorrespondance}
		fermer={laisserFichier}
	/>
{/if}

<style>
	.page {
		display: grid;
		gap: var(--espace-4);
	}

	.sans-ligne {
		display: grid;
		gap: var(--espace-2);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
		background: var(--surface-raised);
	}

	.sans-ligne ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sans-ligne li {
		display: grid;
		grid-template-columns: 6rem 1fr auto auto;
		align-items: center;
		gap: var(--espace-3);
		padding-block: var(--espace-2);
		border-top: 1px solid var(--border);
	}

	.sans-ligne li a {
		overflow: hidden;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sans-ligne .montant {
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.annonces {
		display: grid;
		gap: var(--espace-2);
	}

	.annonces:empty {
		display: none;
	}

	.travail {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: var(--espace-4);
		align-items: start;
	}

	.colonne-file {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.file {
		max-height: calc(100dvh - 240px);
		min-height: 180px;
		overflow-y: auto;
	}

	.pied-file {
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-1);
		padding: var(--espace-1);
		border-top: 1px solid var(--border);
	}

	/* Le volet tient dans la fenêtre : la rangée d'actions reste visible, le détail défile. */
	.volet {
		position: sticky;
		top: 120px;
		display: grid;
		max-height: calc(100dvh - 136px);
		overflow-y: auto;
		gap: var(--espace-3);
		padding: var(--espace-4);
		border: 1px solid var(--border);
		border-radius: var(--rayon-lg);
		background: var(--surface-raised);
	}

	.tete-volet {
		display: grid;
		gap: 2px;
	}

	.tete-volet h2 {
		overflow-wrap: anywhere;
	}

	.sous-titre {
		color: var(--ink-muted);
	}

	.virement {
		display: grid;
		gap: var(--espace-1);
		padding: var(--espace-3);
		border: 2px solid var(--primary);
		border-radius: var(--rayon-md);
		background: var(--primary-soft);
	}

	.nom-virement {
		font-weight: 600;
	}

	.propositions {
		display: grid;
		gap: var(--espace-2);
	}

	.sommes {
		display: grid;
		gap: var(--espace-2);
	}

	.sommes li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--espace-3);
		padding: var(--espace-3);
		border: 1px solid var(--border);
		border-radius: var(--rayon-md);
	}

	.nom-somme {
		font-weight: var(--typo-body-strong-graisse);
		overflow-wrap: anywhere;
	}

	.relies li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: baseline;
		gap: var(--espace-3);
		padding: var(--espace-2) 0;
		border-top: 1px solid var(--border);
	}

	.pose {
		padding: var(--espace-3);
		border-radius: var(--rayon-md);
		background: var(--surface-sunken);
	}

	.actions {
		position: sticky;
		z-index: 1;
		/* Le collant se compte depuis l'intérieur du rembourrage : sans ça, la rangée mord le contenu. */
		bottom: calc(-1 * var(--espace-4));
		display: flex;
		flex-wrap: wrap;
		gap: var(--espace-2);
		margin: 0 calc(-1 * var(--espace-4)) calc(-1 * var(--espace-4));
		padding: var(--espace-3) var(--espace-4);
		border-top: 1px solid var(--border);
		border-radius: 0 0 var(--rayon-lg) var(--rayon-lg);
		background: var(--surface-raised);
	}

	.actions :global(kbd) {
		color: var(--ink);
	}

	.indication {
		color: var(--ink-muted);
	}

	.retrait {
		padding-top: var(--espace-2);
		border-top: 1px solid var(--border);
	}

	.fin {
		display: grid;
		justify-items: start;
		gap: var(--espace-3);
		padding: var(--espace-3) 0;
	}

	.fin .pose {
		justify-self: stretch;
	}

	.voile-depot {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--espace-2);
		border: 2px dashed var(--primary);
		background: var(--primary-soft);
		color: var(--primary);
		pointer-events: none;
	}

	/* Tablette : file et volet s'empilent, la file garde une hauteur raisonnable. */
	@media (max-width: 1023.98px) {
		.travail {
			grid-template-columns: minmax(0, 1fr);
		}

		.file {
			max-height: 40dvh;
		}

		.volet {
			position: static;
			max-height: none;
			overflow-y: visible;
		}
	}

	/* Téléphone : consultation, `barre-ecart` et liste. */
	@media (max-width: 639.98px) {
		.file {
			max-height: none;
		}
	}
</style>
