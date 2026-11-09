/** Seul module qui écrit dans `piece`, `piece_operation` et `piece_creance_dette` (AD-7, AD-16). */
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { GrandJournal } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { montantOperation } from '#lib/domaine/operations/lecture.ts';
import {
	deciderPiece,
	depensesRecentesSansPiece,
	filtrerPieces,
	nomDePiece,
	piecesManquantes,
	trierPieces,
	vuesPieces,
	type DepenseSansPiece,
	type FiltresPieces,
	type PieceDeposee,
	type PieceVue
} from '#lib/domaine/pieces/index.ts';
import { sommeASolder } from '#lib/domaine/creances/index.ts';
import type { DateCivile } from '#lib/domaine/dates.ts';
import type { Centimes } from '#lib/domaine/montant.ts';
import { resumeAnalytique, resumeCompte } from '#lib/domaine/recherche/index.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';

/** Tient sur un téléphone de 320 px, « Rattacher plus tard » restant à portée de pouce. */
export const NOMBRE_DEPENSES_RECENTES = 5;
export const TAILLE_PAGE_PIECES = 48;

/** Facture reçue avant le paiement : la photo se range avec la Dette. */
export type DetteSansPiece = {
	id: number;
	tiers: string;
	motif: string;
	date: DateCivile;
	reste: Centimes;
};

export type EntreeDepot = {
	nomOriginal: string;
	octets: Uint8Array;
	/** Rattachée aussitôt. Sans Opération ni somme, la Pièce attend dans Pièces. */
	operationId: number | null;
	/** Créance ou Dette : la facture reçue avant le paiement. */
	creanceId?: number | null;
};

export type Cible = { operationId: number } | { creanceId: number };
export type EntreeRattachement = { pieceId: number } & Cible;

/** Écrit par le module `pieces`, dans la transaction de l'appelant (AD-7). */
export function rattacherPiece(o: Outils, pieceId: number, operationId: number): Resultat<true> {
	const piece = o.depots.pieces.parId(pieceId);
	const op = o.depots.operations.parId(operationId);
	if (piece === null || op === null) return echec('element_introuvable');
	if (op.annuleeLe !== null) return echec('operation_annulee');
	// Sans effet sur un état : permis sur un Exercice clôturé (AD-5).
	if (o.depots.pieces.rattacher(pieceId, operationId)) {
		o.noter({
			evenement: 'piece.rattachee',
			entiteType: 'operation',
			entiteId: operationId,
			resume: `a joint la Pièce « ${piece.nomOriginal} » à « ${op.libelle} ».`
		});
	}
	return succes(true);
}

/**
 * Joint une Pièce à une Créance ou une Dette, et à chaque Opération qui l'a déjà soldée : le
 * paiement est justifié par la même facture. Dans la transaction de l'appelant (AD-7).
 */
export function rattacherPieceSomme(o: Outils, pieceId: number, creanceId: number): Resultat<true> {
	const piece = o.depots.pieces.parId(pieceId);
	const j = o.depots.operations.journal();
	const c = j.creancesDettes.find((x) => x.id === creanceId);
	if (piece === null || c === undefined) return echec('element_introuvable');
	if (o.depots.pieces.rattacherSomme(pieceId, creanceId)) {
		o.noter({
			evenement: 'piece.rattachee',
			entiteType: 'creance_dette',
			entiteId: creanceId,
			resume: `a joint la Pièce « ${piece.nomOriginal} » à « ${c.tiers}, ${c.motif} ».`
		});
	}
	const actives = new Set(j.operations.map((op) => op.id));
	for (const r of c.reglements) {
		if (!actives.has(r.operationId)) continue;
		const fait = rattacherPiece(o, pieceId, r.operationId);
		if (!fait.ok) return fait;
	}
	return succes(true);
}

/** Les Pièces d'une somme suivent l'Opération qui la solde, dans sa transaction. */
export function joindrePiecesDeSomme(
	o: Outils,
	creanceId: number,
	operationId: number
): Resultat<true> {
	const c = o.depots.operations.journal().creancesDettes.find((x) => x.id === creanceId);
	for (const p of c?.pieces ?? []) {
		const fait = rattacherPiece(o, p.id, operationId);
		if (!fait.ok) return fait;
	}
	return succes(true);
}

/** Les Pièces déposées pendant une saisie se rattachent avec l'Opération, dans sa transaction. */
export function rattacherPieces(
	o: Outils,
	pieceIds: readonly number[],
	operationId: number
): Resultat<true> {
	for (const id of pieceIds) {
		const r = rattacherPiece(o, id, operationId);
		if (!r.ok) return r;
	}
	return succes(true);
}

export function creerPieces(socle: Socle, executer: Executer, lire: Lire) {
	const depots = socle.depots;

	const neutres = () =>
		new Set(
			depots.parametrage
				.natures()
				.filter((n) => n.neutre)
				.map((n) => n.id)
		);

	const vues = (j: GrandJournal) =>
		vuesPieces(depots.pieces.lister(), depots.pieces.liens(), j, depots.pieces.liensSommes());

	const casDepot: CasUsage<EntreeDepot, PieceDeposee> = {
		droit: 'saisir',
		// Redéposer un fichier connu, sans Opération, n'écrit rien : il n'y a rien à noter.
		sansJournal: true,
		faire(o, e) {
			const format = deciderPiece(e.octets);
			if (!format.ok) return format;

			// Le fichier existe avant sa ligne : écrit et renommé ici, validé au commit (AD-16).
			const sha256 = socle.fichiers.ecrire(e.octets);
			const connue = o.depots.pieces.parSha(sha256);
			const nomOriginal = connue?.nomOriginal ?? nomDePiece(e.nomOriginal);
			const id =
				connue?.id ??
				o.depots.pieces.creer({
					sha256,
					nomOriginal,
					mime: format.valeur,
					tailleOctets: e.octets.length,
					creeLe: o.ctx.maintenant,
					creePar: (o.ctx.acces as NonNullable<Ctx['acces']>).id
				});
			if (connue === null) {
				o.noter({
					evenement: 'piece.deposee',
					entiteType: 'piece',
					entiteId: id,
					resume: `a déposé la Pièce « ${nomOriginal} ».`
				});
			}
			if (e.operationId !== null) {
				const r = rattacherPiece(o, id, e.operationId);
				if (!r.ok) return r;
			} else if (e.creanceId) {
				const r = rattacherPieceSomme(o, id, e.creanceId);
				if (!r.ok) return r;
			}
			return succes({
				id,
				sha256,
				nomOriginal,
				mime: format.valeur,
				connue: connue !== null,
				autresOperations: o.depots.pieces
					.liens()
					.filter((l) => l.pieceId === id && l.operationId !== e.operationId).length
			});
		}
	};

	const casRattacher: CasUsage<EntreeRattachement, true> = {
		droit: 'saisir',
		sansJournal: true,
		faire: (o, e) =>
			'creanceId' in e
				? rattacherPieceSomme(o, e.pieceId, e.creanceId)
				: rattacherPiece(o, e.pieceId, e.operationId)
	};

	/** Retirée de la somme seulement : une Opération qui la porte la garde, et se corrige à part. */
	function detacherDeSomme(o: Outils, pieceId: number, creanceId: number): Resultat<true> {
		const piece = o.depots.pieces.parId(pieceId);
		const c = o.depots.operations.journal().creancesDettes.find((x) => x.id === creanceId);
		if (piece === null || c === undefined) return echec('element_introuvable');
		if (o.depots.pieces.detacherSomme(pieceId, creanceId)) {
			o.noter({
				evenement: 'piece.detachee',
				entiteType: 'creance_dette',
				entiteId: creanceId,
				resume: `a retiré la Pièce « ${piece.nomOriginal} » de « ${c.tiers}, ${c.motif} ».`
			});
		}
		return succes(true);
	}

	const casDetacher: CasUsage<EntreeRattachement, true> = {
		droit: 'saisir',
		sansJournal: true,
		faire(o, e) {
			if ('creanceId' in e) return detacherDeSomme(o, e.pieceId, e.creanceId);
			const piece = o.depots.pieces.parId(e.pieceId);
			const op = o.depots.operations.parId(e.operationId);
			if (piece === null || op === null) return echec('element_introuvable');
			if (o.depots.pieces.detacher(e.pieceId, e.operationId)) {
				o.noter({
					evenement: 'piece.detachee',
					entiteType: 'operation',
					entiteId: op.id,
					resume: `a retiré la Pièce « ${piece.nomOriginal} » de « ${op.libelle} ».`
				});
			}
			return succes(true);
		}
	};

	/** F7 : seule la ligne d'une Pièce sans Opération part. Le fichier reste jusqu'à la sauvegarde. */
	const casSupprimer: CasUsage<number, true> = {
		droit: 'saisir',
		faire(o, id) {
			const piece = o.depots.pieces.parId(id);
			if (piece === null) return echec('element_introuvable');
			if (
				o.depots.pieces.liens().some((l) => l.pieceId === id) ||
				o.depots.pieces.liensSommes().some((l) => l.pieceId === id)
			) {
				return echec('piece_utilisee');
			}
			o.depots.pieces.supprimer(id);
			o.noter({
				evenement: 'piece.supprimee',
				entiteType: 'piece',
				entiteId: id,
				resume: `a supprimé la Pièce en attente « ${piece.nomOriginal} ».`,
				avant: piece
			});
			return succes(true);
		}
	};

	function rangee(j: GrandJournal, op: GrandJournal['operations'][number]): DepenseSansPiece {
		const noms = {
			comptes: depots.parametrage.comptes(),
			natures: depots.parametrage.natures(),
			actions: depots.parametrage.actions()
		};
		return {
			id: op.id,
			date: op.date,
			libelle: op.libelle,
			compte: resumeCompte(op, noms),
			...resumeAnalytique(op, noms),
			montant: centimes(Math.abs(montantOperation(op))),
			exercice:
				j.exercices.find((e) => e.debut && e.fin && e.debut <= op.date && op.date <= e.fin)
					?.libelle ?? null
		};
	}

	return {
		deposer: (ctx: Ctx, e: EntreeDepot) => executer(casDepot, ctx, e),
		rattacher: (ctx: Ctx, e: EntreeRattachement) => executer(casRattacher, ctx, e),
		detacher: (ctx: Ctx, e: EntreeRattachement) => executer(casDetacher, ctx, e),
		supprimer: (ctx: Ctx, id: number) => executer(casSupprimer, ctx, id),

		/** Toute personne autorisée lit le fichier, jamais un chemin (AD-16). */
		fichier(ctx: Ctx, sha256: string) {
			const r = lire(ctx, 'consulter', () => {
				const piece = depots.pieces.parSha(sha256);
				if (piece === null) return null;
				const octets = socle.fichiers.lire(sha256);
				return octets === null ? null : { octets, mime: piece.mime, nom: piece.nomOriginal };
			});
			if (!r.ok) return r;
			return r.valeur === null ? echec('element_introuvable') : succes(r.valeur);
		},

		/** Pièces manquantes de l'Exercice regardé (F6), triées par date. */
		manquantes(ctx: Ctx, exercice: Exercice | null): Resultat<DepenseSansPiece[]> {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				return piecesManquantes(j, neutres(), exercice).map((op) => rangee(j, op));
			});
		},

		compterManquantes(ctx: Ctx, exercice: Exercice | null): Resultat<number> {
			return lire(ctx, 'consulter', () => {
				const j = depots.operations.journal();
				return piecesManquantes(j, neutres(), exercice).length;
			});
		},

		/** Ce qu'on propose après une photo : le ticket va le plus souvent sur la dernière dépense. */
		depensesRecentes(ctx: Ctx): Resultat<DepenseSansPiece[]> {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				return depensesRecentesSansPiece(j, neutres(), NOMBRE_DEPENSES_RECENTES).map((op) =>
					rangee(j, op)
				);
			});
		},

		/** Dettes ouvertes sans Pièce, les plus récentes d'abord. Celle d'un Avoir a la sienne. */
		dettesSansPiece(ctx: Ctx): Resultat<DetteSansPiece[]> {
			return lire(ctx, 'saisir', () => {
				const j = depots.operations.journal();
				return j.creancesDettes
					.filter(
						(c) =>
							c.sens === 'dette' && (c.factureId ?? null) === null && (c.pieces ?? []).length === 0
					)
					.flatMap((c) => {
						const s = sommeASolder(c, j, ctx.aujourdhui);
						return s
							? [{ id: c.id, tiers: c.tiers, motif: c.motif, date: c.date, reste: s.reste }]
							: [];
					})
					.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
					.slice(0, NOMBRE_DEPENSES_RECENTES);
			});
		},

		parId(ctx: Ctx, id: number): Resultat<PieceVue> {
			const r = lire(ctx, 'consulter', () =>
				vues(depots.operations.journal()).find((p) => p.id === id)
			);
			if (!r.ok) return r;
			return r.valeur === undefined ? echec('element_introuvable') : succes(r.valeur);
		},

		lister(ctx: Ctx, filtres: FiltresPieces, page: number) {
			return lire(ctx, 'consulter', () => {
				const toutes = vues(depots.operations.journal());
				const trouvees = trierPieces(filtrerPieces(toutes, filtres));
				const pages = Math.max(1, Math.ceil(trouvees.length / TAILLE_PAGE_PIECES));
				const courante = Math.min(page, pages);
				const debut = (courante - 1) * TAILLE_PAGE_PIECES;
				return {
					pieces: trouvees.slice(debut, debut + TAILLE_PAGE_PIECES),
					total: trouvees.length,
					existantes: toutes.length,
					page: courante,
					pages
				};
			});
		}
	};
}

export type ModulePieces = ReturnType<typeof creerPieces>;
