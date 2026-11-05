/** Seul module qui écrit dans `piece` et `piece_operation` (AD-7, AD-16). */
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
import { resumeAnalytique, resumeCompte } from '#lib/domaine/recherche/index.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { CasUsage, Ctx, Executer, Lire, Outils, Socle } from '../executer.ts';

/** Tient sur un téléphone de 320 px, « Rattacher plus tard » restant à portée de pouce. */
export const NOMBRE_DEPENSES_RECENTES = 5;
export const TAILLE_PAGE_PIECES = 48;

export type EntreeDepot = {
	nomOriginal: string;
	octets: Uint8Array;
	/** Rattachée aussitôt. Sans Opération, la Pièce attend dans Pièces. */
	operationId: number | null;
};

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

	const vues = (j: GrandJournal) => vuesPieces(depots.pieces.lister(), depots.pieces.liens(), j);

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

	const casRattacher: CasUsage<{ pieceId: number; operationId: number }, true> = {
		droit: 'saisir',
		sansJournal: true,
		faire: (o, e) => rattacherPiece(o, e.pieceId, e.operationId)
	};

	const casDetacher: CasUsage<{ pieceId: number; operationId: number }, true> = {
		droit: 'saisir',
		sansJournal: true,
		faire(o, e) {
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
			if (o.depots.pieces.liens().some((l) => l.pieceId === id)) return echec('piece_utilisee');
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
		rattacher: (ctx: Ctx, e: { pieceId: number; operationId: number }) =>
			executer(casRattacher, ctx, e),
		detacher: (ctx: Ctx, e: { pieceId: number; operationId: number }) =>
			executer(casDetacher, ctx, e),
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
