/**
 * Lectures des états (FR-15, FR-30 à FR-33, FR-35) : tout se recalcule depuis le grand journal
 * (AD-4). Un Exercice clôturé se calcule avec son paramétrage figé (AD-5).
 */
import { recettesARevoir } from '#lib/domaine/caisse/saisie.ts';
import { formaterDateLongue } from '#lib/domaine/dates.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import { messageAnomalie } from '#lib/domaine/etats/anomalies.ts';
import {
	bilan,
	bilanCloture,
	caisseACompter,
	cartesComptes,
	chequesARemettre,
	dernierPointage,
	lignesNonPointees,
	operationsAnciennes,
	sansReleve,
	sessionsNonCloturees,
	type Bilan
} from '#lib/domaine/etats/controle.ts';
import {
	comparerResultats,
	exercicesComparables,
	exercicesCompares,
	type Comparaison
} from '#lib/domaine/etats/comparaison.ts';
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
	cheminFacture,
	csvBudget,
	csvChequesEmis,
	csvChequesRecus,
	csvFactures,
	csvComptages,
	csvLignes,
	csvOperations,
	csvPointages,
	csvRemises,
	csvSessions,
	lisezMoi,
	listePiecesManquantes
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
import { controlerSuite, totalFacture } from '#lib/domaine/factures/index.ts';
import { piecesManquantes } from '#lib/domaine/pieces/index.ts';
import { chequesAbsents } from '#lib/domaine/releve/cheques.ts';
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

/** F3, F5, F7 : la suite sans trou, le PDF conservé, la Créance de chaque Facture validée. */
function violationsFactures(
	depots: Pick<Depots, 'factures'>,
	fichiers: Socle['fichiers'],
	j: Pick<GrandJournal, 'creancesDettes'>
): Violation[] {
	const factures = depots.factures.lister();
	const suite = controlerSuite(factures, depots.factures.compteurs());
	return [
		...suite.map((message) => ({ invariant: 'F3', message })),
		...factures.flatMap((f): Violation[] => {
			if (f.numero === null) return [];
			const v: Violation[] = [];
			if (f.fichierSha256 === null || !fichiers.existe(f.fichierSha256)) {
				v.push({ invariant: 'F7', message: `Le PDF de ${f.numero} est absent.` });
			}
			const creance = j.creancesDettes.find((c) => c.factureId === f.id && c.sens === 'creance');
			if (f.type === 'facture' && creance?.montant !== totalFacture(f.lignes)) {
				v.push({ invariant: 'F3', message: `La Créance de ${f.numero} ne suit pas sa Facture.` });
			}
			return v;
		})
	];
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
		const cartes = cartesComptes(j, e, aujourdhui, p.comptes, p.clotureLe ?? null);
		const anciennes = operationsAnciennes(j, debutsReleve(), e);
		const pieces = piecesManquantes(j, neutres(), e).length;
		const cloture = e.statut === 'cloture';
		const premierReleve = !cloture && sansReleve(j, cartes, e);
		const caisses = cartes.filter((c) => c.compte.type === 'caisse');
		const absents = chequesAbsents(j, e.fin as string).length;
		const recettes = recettesARevoir(j).length;
		const taches = cloture
			? []
			: [
					{ id: 'lignes' as const, compteur: lignesNonPointees(j, e) },
					{ id: 'pieces' as const, compteur: pieces },
					{ id: 'cheques' as const, compteur: chequesARemettre(j, e) },
					{ id: 'anciennes' as const, compteur: anciennes.length },
					// Un signalement, pas une tâche de tous les jours : absent quand tout est inscrit.
					...(absents > 0 ? [{ id: 'cheques_absents' as const, compteur: absents }] : []),
					...(caisses.length > 0 && !premierReleve
						? [{ id: 'comptages' as const, compteur: caisses.filter(caisseACompter).length }]
						: []),
					...(caisses.length > 0
						? [{ id: 'sessions' as const, compteur: sessionsNonCloturees(j, e) }]
						: []),
					...(recettes > 0 ? [{ id: 'recettes' as const, compteur: recettes }] : [])
				];
		const anomalies = anomaliesEquation(equationDeControle(j, e, p));
		const { lignes, constats } = j.relevesDemesures;
		const demesures = [...new Set([...lignes, ...constats].map((x) => x.compteId))];
		const lu = cloture ? bilanCloture(cartes) : bilan(cartes, taches, premierReleve);
		return {
			cartes,
			taches,
			premierReleve,
			// Une équation fausse n'est jamais « Tout est à jour » (AD-4).
			bilan:
				anomalies.length + demesures.length > 0 && lu.type === 'a_jour'
					? anormal(anomalies.length + demesures.length)
					: lu,
			demesures,
			anomalies: anomalies.map(messageAnomalie),
			dernierPointage: dernierPointage(j, e)
		};
	}

	/** Chaque Exercice comparé se calcule seul, avec son paramétrage figé s'il est clôturé (AD-5). */
	function comparaisonDe(
		j: GrandJournal,
		e: Exercice,
		comparer: string | null
	): Comparaison | null {
		const compares = exercicesCompares(j.exercices, e, comparer);
		if (compares.length === 0) return null;
		return comparerResultats(
			compteDeResultat(j, e, parametrageDe(depots, e)),
			compares.map((x) => ({
				exercice: x,
				resultat: compteDeResultat(j, x, parametrageDe(depots, x))
			}))
		);
	}

	function modele(
		j: GrandJournal,
		etat: TypeEtat,
		e: Exercice,
		aujourdhui: string,
		actionId: number | null,
		comparer: string | null
	): ModeleDocument | null {
		const p = parametrageDe(depots, e);
		const nom = nomApe();
		if (etat === 'compte-de-resultat') {
			const r = compteDeResultat(j, e, p);
			return modeleCompteDeResultat(r, e, nom, comparaisonDe(j, e, comparer));
		}
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
			cartes: cartesComptes(j, e, aujourdhui, p.comptes, p.clotureLe ?? null)
		});
	}

	const casVerifier: CasUsage<void, Violation[]> = {
		droit: 'public',
		sansJournal: true,
		faire(o) {
			const j = o.depots.operations.journal();
			const violations = verifierJournal(
				j,
				(e) => parametrageDe(o.depots, e),
				new Set(o.depots.journal.entitesDe('session.rouverte'))
			);
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
			violations.push(...violationsFactures(o.depots, socle.fichiers, j));
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

		compteDeResultat(ctx: Ctx, e: Exercice, comparer: string | null = null) {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				const p = parametrageDe(depots, e);
				const resultat = compteDeResultat(j, e, p);
				const tresorerie = etatTresorerie(j, e, p);
				const anomalies = [...resultat.anomalies, ...tresorerie.anomalies];
				return {
					resultat,
					anomalies: anomalies.map(messageAnomalie),
					comparaison: comparaisonDe(j, e, comparer),
					comparables: exercicesComparables(j.exercices, e).map((x) => x.libelle)
				};
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
			actionId: number | null = null,
			comparer: string | null = null
		): Resultat<ModeleDocument> {
			const r = lire(ctx, 'consulter', () =>
				modele(depots.operations.journal(), etat, e, ctx.aujourdhui, actionId, comparer)
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
					'comptages.csv': csv(csvComptages(j, p)),
					'sessions.csv': csv(csvSessions(j, p)),
					'cheques-recus.csv': csv(csvChequesRecus(j, p)),
					'remises.csv': csv(csvRemises(j, p)),
					'cheques-emis.csv': csv(csvChequesEmis(j, p)),
					'factures.csv': csv(csvFactures(depots.factures.lister())),
					'budget.csv': csv(csvBudget(depots.budget.toutes(), j.exercices, p))
				};
				// Lu après les Pièces, en dernier : le flux n'apprend qu'en route ce qui manque.
				const manquantes: string[] = [];
				const fichiers: EntreeArchive[] = [
					...Object.entries(textes).map(([nom, texte]) => ({ nom, lire: () => texte })),
					...depots.pieces.lister().map((piece) => ({
						nom: cheminPiece(piece),
						lire() {
							const contenu = socle.fichiers.lire(piece.sha256);
							if (contenu === null) manquantes.push(cheminPiece(piece));
							return contenu;
						}
					})),
					...depots.factures.lister().flatMap((f) =>
						f.fichierSha256 === null
							? []
							: [
									{
										nom: cheminFacture(f),
										lire: () => socle.fichiers.lire(f.fichierSha256 as string)
									}
								]
					),
					{ nom: 'PIECES-MANQUANTES.txt', lire: () => listePiecesManquantes(manquantes) }
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
