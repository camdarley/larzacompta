/**
 * Lectures des états (FR-15, FR-30 à FR-33, FR-35) : tout se recalcule depuis le grand journal
 * (AD-4). Un Exercice clôturé se calcule avec son paramétrage figé (AD-5).
 */
import { formaterDateLongue } from '#lib/domaine/dates.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import { messageAnomalie } from '#lib/domaine/etats/anomalies.ts';
import {
	bilan,
	bilanCloture,
	caisseACompter,
	cartesComptes,
	dernierPointage,
	lignesNonPointees,
	operationsAnciennes,
	sansReleve,
	sessionsNonCloturees,
	type Bilan
} from '#lib/domaine/etats/controle.ts';
import {
	modeleAction,
	modeleActions,
	modeleCompteDeResultat,
	modeleDocumentAg,
	modeleTresorerie,
	type ModeleDocument
} from '#lib/domaine/etats/documents.ts';
import {
	cheminPiece,
	csvComptages,
	csvLignes,
	csvOperations,
	csvPointages,
	lisezMoi
} from '#lib/domaine/etats/export-complet.ts';
import {
	anomaliesEquation,
	compteDeResultat,
	detailAction,
	equationDeControle,
	resultatParAction,
	type ParametrageEtats
} from '#lib/domaine/etats/resultat.ts';
import { etatTresorerie } from '#lib/domaine/etats/tresorerie.ts';
import { serialiserCloture } from '#lib/domaine/etats/cloture.ts';
import { verifierJournal, type Violation } from '#lib/domaine/etats/verification.ts';
import { piecesManquantes } from '#lib/domaine/pieces/index.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Socle } from '../executer.ts';
import type { Depots, EntreeArchive } from '../ports.ts';

export function parametrageCourant(depots: Pick<Depots, 'parametrage'>): ParametrageEtats {
	const d = depots.parametrage;
	return { groupes: d.groupes(), natures: d.natures(), actions: d.actions(), comptes: d.comptes() };
}

/** Paramétrage figé d'un Exercice clôturé, courant sinon. */
export function parametrageDe(
	depots: Pick<Depots, 'parametrage' | 'exercices'>,
	e: Exercice
): ParametrageEtats {
	const cloture = e.statut === 'cloture' ? depots.exercices.cloture(e.id) : null;
	return cloture
		? {
				...(JSON.parse(cloture.parametrageFigeJson) as ParametrageEtats),
				clotureLe: cloture.clotureLe
			}
		: parametrageCourant(depots);
}

const anormal = (nombre: number): Bilan => ({ type: 'taches', nombre });

export type TypeEtat = 'compte-de-resultat' | 'tresorerie' | 'actions' | 'action' | 'document-ag';

export function creerEtats(socle: Socle, executer: Executer, lire: Lire) {
	const { depots } = socle;

	const nomApe = () => depots.parametrage.association()?.nom ?? '';
	const neutres = () =>
		new Set(
			depots.parametrage
				.natures()
				.filter((n) => n.neutre)
				.map((n) => n.id)
		);

	function debutsReleve() {
		const debuts = new Map<number, string>();
		for (const c of depots.parametrage.comptes()) {
			const derniere = [...depots.pointage.periodes(c.id)].sort((a, b) => a.id - b.id).at(-1);
			if (derniere?.dateMin) debuts.set(c.id, derniere.dateMin);
		}
		return debuts;
	}

	function tableauDe(j: GrandJournal, e: Exercice, aujourdhui: string) {
		const p = parametrageDe(depots, e);
		const cartes = cartesComptes(j, e, aujourdhui, p.comptes);
		const anciennes = operationsAnciennes(j, debutsReleve(), e);
		const pieces = piecesManquantes(j, neutres(), e).length;
		const cloture = e.statut === 'cloture';
		const premierReleve = !cloture && sansReleve(j, cartes, e);
		const caisses = cartes.filter((c) => c.compte.type === 'caisse');
		const taches = cloture
			? []
			: [
					{ id: 'lignes' as const, compteur: lignesNonPointees(j, e) },
					{ id: 'pieces' as const, compteur: pieces },
					{ id: 'anciennes' as const, compteur: anciennes.length },
					...(caisses.length > 0 && !premierReleve
						? [{ id: 'comptages' as const, compteur: caisses.filter(caisseACompter).length }]
						: []),
					...(caisses.length > 0
						? [{ id: 'sessions' as const, compteur: sessionsNonCloturees(j, e) }]
						: [])
				];
		const anomalies = anomaliesEquation(equationDeControle(j, e, p));
		const lu = cloture ? bilanCloture(cartes) : bilan(cartes, taches, premierReleve);
		return {
			cartes,
			taches,
			premierReleve,
			// Une équation fausse n'est jamais « Tout est à jour » (AD-4).
			bilan: anomalies.length > 0 && lu.type === 'a_jour' ? anormal(anomalies.length) : lu,
			anomalies: anomalies.map(messageAnomalie),
			dernierPointage: dernierPointage(j, e)
		};
	}

	function modele(
		j: GrandJournal,
		etat: TypeEtat,
		e: Exercice,
		aujourdhui: string,
		actionId: number | null
	): ModeleDocument | null {
		const p = parametrageDe(depots, e);
		const nom = nomApe();
		if (etat === 'compte-de-resultat')
			return modeleCompteDeResultat(compteDeResultat(j, e, p), e, nom);
		if (etat === 'tresorerie') return modeleTresorerie(etatTresorerie(j, e, p), e, nom);
		if (etat === 'actions') return modeleActions(resultatParAction(j, e, p), e, nom);
		if (etat === 'action') {
			const a = detailAction(resultatParAction(j, e, p), actionId ?? 0);
			return a && modeleAction(a, e, nom);
		}
		return modeleDocumentAg({
			exercice: e,
			association: nom,
			resultat: compteDeResultat(j, e, p),
			tresorerie: etatTresorerie(j, e, p),
			cartes: cartesComptes(j, e, aujourdhui, p.comptes)
		});
	}

	const casVerifier: CasUsage<void, Violation[]> = {
		droit: 'public',
		sansJournal: true,
		faire(o) {
			const j = o.depots.operations.journal();
			const violations = verifierJournal(j, (e) => parametrageDe(o.depots, e));
			for (const e of j.exercices.filter((x) => x.statut === 'cloture')) {
				const cloture = o.depots.exercices.cloture(e.id);
				if (cloture === null) {
					violations.push({
						invariant: 'Empreinte de clôture',
						message: 'Clôture introuvable.',
						exercice: e.libelle
					});
					continue;
				}
				const texte = serialiserCloture(j, e, parametrageDe(o.depots, e));
				if (socle.jetons.empreinte(texte) !== cloture.empreinte) {
					violations.push({
						invariant: 'Empreinte de clôture',
						message: `Les données de ${e.libelle} ont changé depuis sa clôture.`,
						exercice: e.libelle
					});
				}
			}
			if (o.depots.acces.tresoriersActifs().length === 0 && o.depots.acces.compter() > 0) {
				violations.push({ invariant: 'A1', message: 'Aucun Accès trésorier·e actif.' });
			}
			for (const piece of o.depots.pieces.lister()) {
				if (!socle.fichiers.existe(piece.sha256)) {
					violations.push({
						invariant: 'F7',
						message: `Le fichier de la Pièce ${piece.id} est absent.`
					});
				}
			}
			return succes(violations);
		}
	};

	return {
		tableau(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'consulter', () =>
				tableauDe(depots.operations.journal(), e, ctx.aujourdhui)
			);
		},

		/** Opérations non pointées, antérieures au dernier relevé : la tuile « anciennes ». */
		anciennes(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'consulter', () =>
				operationsAnciennes(depots.operations.journal(), debutsReleve(), e)
			);
		},

		compteDeResultat(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const p = parametrageDe(depots, e);
				const resultat = compteDeResultat(j, e, p);
				const tresorerie = etatTresorerie(j, e, p);
				const anomalies = [...resultat.anomalies, ...tresorerie.anomalies];
				return { resultat, anomalies: anomalies.map(messageAnomalie) };
			});
		},

		tresorerie(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'consulter', () => {
				const etat = etatTresorerie(depots.operations.journal(), e, parametrageDe(depots, e));
				return { etat, anomalies: etat.anomalies.map(messageAnomalie) };
			});
		},

		actions(ctx: Ctx, e: Exercice) {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const p = parametrageDe(depots, e);
				const resultat = resultatParAction(j, e, p);
				const tresorerie = etatTresorerie(j, e, p);
				return {
					resultat,
					/** Sans aucune Action paramétrée : l'état vide d'EXPERIENCE.md. */
					aucuneAction: p.actions.length === 0,
					resultatExercice: tresorerie.explication.resultat,
					anomalies: [...resultat.anomalies, ...tresorerie.anomalies].map(messageAnomalie)
				};
			});
		},

		action(ctx: Ctx, e: Exercice, actionId: number) {
			const r = lire(ctx, 'consulter', () => {
				const p = parametrageDe(depots, e);
				const fiche = p.actions.find((a) => a.id === actionId);
				if (fiche === undefined) return null;
				const resultat = resultatParAction(depots.operations.journal(), e, p);
				return {
					libelle: fiche.libelle,
					groupe: p.groupes.find((g) => g.id === fiche.groupeId)?.libelle ?? '',
					action: detailAction(resultat, actionId),
					anomalies: resultat.anomalies.map(messageAnomalie)
				};
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Modèle déjà calculé, remis au rendu (AD-18). */
		modele(
			ctx: Ctx,
			etat: TypeEtat,
			e: Exercice,
			actionId: number | null = null
		): Resultat<ModeleDocument> {
			const r = lire(ctx, 'consulter', () =>
				modele(depots.operations.journal(), etat, e, ctx.aujourdhui, actionId)
			);
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Archive lisible sans l'outil (FR-35). */
		exportComplet(ctx: Ctx): Resultat<{ nom: string; flux: ReadableStream<Uint8Array> }> {
			return lire(ctx, 'parametrer', () => {
				const j = depots.operations.journal();
				const p = parametrageCourant(depots);
				const csv = (t: { entetes: string[]; lignes: string[][] }) =>
					socle.exporteurs.csv(t.entetes, t.lignes);
				// Une Ligne se lit avec le paramétrage de son Exercice, comme l'état du même Exercice.
				const figes = new Map<number, ParametrageEtats>();
				const parExercice = (e: Exercice) => {
					const lu = figes.get(e.id) ?? parametrageDe(depots, e);
					figes.set(e.id, lu);
					return lu;
				};
				const textes: Record<string, string> = {
					'LISEZMOI.txt': lisezMoi(nomApe(), formaterDateLongue(ctx.aujourdhui), j.exercices),
					'operations.csv': csv(csvOperations(j, p)),
					'lignes.csv': csv(csvLignes(j, p, parExercice)),
					'pointages.csv': csv(csvPointages(j, p)),
					'comptages.csv': csv(csvComptages(j, p))
				};
				const fichiers: EntreeArchive[] = [
					...Object.entries(textes).map(([nom, texte]) => ({ nom, lire: () => texte })),
					...depots.pieces.lister().map((piece) => ({
						nom: cheminPiece(piece),
						lire: () => socle.fichiers.lire(piece.sha256)
					}))
				];
				return {
					nom: `export-complet-${ctx.aujourdhui}.zip`,
					flux: socle.exporteurs.zip(fichiers)
				};
			});
		},

		verifier: (ctx: Ctx) => executer(casVerifier, ctx, undefined)
	};
}

export type ModuleEtats = ReturnType<typeof creerEtats>;
