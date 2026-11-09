/** Pièces : format reconnu sur les octets, Pièces manquantes (F6), lecture et filtres (AD-16). */
import type { DateCivile, Instant } from '../dates.ts';
import { colonneDe } from '../etats/soldes.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, LigneJ, OperationJ, PieceJ } from '../journal.ts';
import { montantOperation } from '../operations/lecture.ts';
import { echec, succes, type Resultat } from '../resultat.ts';
import type { Centimes } from '../montant.ts';

/** 20 Mio (AD-16). L'écran dit « 20 Mo », comme EXPERIENCE.md. */
export const TAILLE_MAX_PIECE = 20 * 1024 * 1024;

export const FORMATS_PIECE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type FormatPiece = (typeof FORMATS_PIECE)[number];

export const ACCEPTE_PIECE = FORMATS_PIECE.join(',');

const commencePar = (o: Uint8Array, signature: readonly number[], decalage = 0) =>
	signature.every((octet, i) => o[decalage + i] === octet);

const ascii = (texte: string) => [...texte].map((c) => c.charCodeAt(0));

/** Le format se lit sur les octets, jamais sur l'en-tête HTTP ni sur l'extension. */
export function formatDePiece(o: Uint8Array): FormatPiece | null {
	if (commencePar(o, ascii('%PDF-'))) return 'application/pdf';
	if (commencePar(o, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (commencePar(o, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (commencePar(o, ascii('RIFF')) && commencePar(o, ascii('WEBP'), 8)) return 'image/webp';
	return null;
}

export function deciderPiece(octets: Uint8Array): Resultat<FormatPiece> {
	if (octets.length === 0 || octets.length > TAILLE_MAX_PIECE) return echec('piece_refusee');
	const format = formatDePiece(octets);
	return format === null ? echec('piece_refusee') : succes(format);
}

/** Le nom sert à l'affichage et au téléchargement, jamais à un chemin (AD-16). */
export function nomDePiece(nom: string): string {
	const net = nom
		.split(/[/\\]/)
		.at(-1)
		?.replace(/[\p{Cc}]/gu, '')
		.trim();
	return (net || 'piece').slice(0, 200);
}

/** Une Ligne de dépense sort de l'argent : ni une réduction, ni une Nature neutre (somme rendue). */
function estLigneDeDepense(l: LigneJ, neutres: ReadonlySet<number>) {
	return l.montant < 0 && colonneDe(l) === 'depense' && !neutres.has(l.natureId);
}

/** F6 : Opération non annulée, d'origine `saisie`, avec une Ligne de dépense, sans Pièce ni dispense. */
export function estPieceManquante(op: OperationJ, neutres: ReadonlySet<number>): boolean {
	return (
		op.annuleeLe === null &&
		op.origine === 'saisie' &&
		op.pieces.length === 0 &&
		!op.sansPiece &&
		op.lignes.some((l) => estLigneDeDepense(l, neutres))
	);
}

/** Une dépense seulement : la case « Pas besoin de Pièce » ne se montre que dans ce cas. */
export function porteUneDepense(op: OperationJ, neutres: ReadonlySet<number>): boolean {
	return op.lignes.some((l) => estLigneDeDepense(l, neutres));
}

const dansExercice = (op: OperationJ, e: Pick<Exercice, 'debut' | 'fin'> | null) =>
	e === null || e.debut === null || e.fin === null || (e.debut <= op.date && op.date <= e.fin);

/** Triées par date, de la plus ancienne à la plus récente. */
export function piecesManquantes(
	j: Pick<GrandJournal, 'operations'>,
	neutres: ReadonlySet<number>,
	exercice: Pick<Exercice, 'debut' | 'fin'> | null
): OperationJ[] {
	return j.operations
		.filter((op) => estPieceManquante(op, neutres) && dansExercice(op, exercice))
		.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

/** Les plus récentes d'abord, pour le ticket qu'on vient de photographier. */
export function depensesRecentesSansPiece(
	j: Pick<GrandJournal, 'operations'>,
	neutres: ReadonlySet<number>,
	nombre: number
): OperationJ[] {
	return piecesManquantes(j, neutres, null).reverse().slice(0, nombre);
}

/** Réponse d'un dépôt. */
export type PieceDeposee = {
	id: number;
	sha256: string;
	nomOriginal: string;
	mime: string;
	/** Le même fichier était déjà là : une seule Pièce existe (AD-16). */
	connue: boolean;
	/** Autres Opérations que justifie déjà ce fichier. */
	autresOperations: number;
};

export type DepenseSansPiece = {
	id: number;
	date: DateCivile;
	libelle: string;
	compte: string;
	natures: string;
	actions: string;
	/** Positif : c'est une dépense, le signe n'apprend rien ici. */
	montant: Centimes;
	exercice: string | null;
};

export type OperationDePiece = {
	id: number;
	libelle: string;
	date: DateCivile;
	montant: Centimes;
	annulee: boolean;
};

export type PieceStockee = PieceJ & { tailleOctets: number; creeLe: Instant };

/** Créance ou Dette que la Pièce justifie, la facture reçue par exemple. */
export type SommeDePiece = {
	id: number;
	sens: 'creance' | 'dette';
	tiers: string;
	motif: string;
	annulee: boolean;
};

/** Une Pièce sans Opération ni somme attend son rattachement. */
export type PieceVue = PieceStockee & { operations: OperationDePiece[]; sommes: SommeDePiece[] };

export const estRattachee = (p: Pick<PieceVue, 'operations' | 'sommes'>) =>
	p.operations.length > 0 || p.sommes.length > 0;

export function vuesPieces(
	pieces: readonly PieceStockee[],
	liens: readonly { pieceId: number; operationId: number }[],
	j: Pick<GrandJournal, 'operations' | 'operationsAnnulees'> &
		Partial<Pick<GrandJournal, 'creancesDettes'>>,
	liensSommes: readonly { pieceId: number; creanceId: number }[] = []
): PieceVue[] {
	const operations = new Map(
		[...j.operations, ...j.operationsAnnulees].map((op) => [op.id, op] as const)
	);
	const sommes = new Map((j.creancesDettes ?? []).map((c) => [c.id, c] as const));
	return pieces.map((p) => ({
		...p,
		sommes: liensSommes
			.filter((l) => l.pieceId === p.id)
			.flatMap((l) => {
				const c = sommes.get(l.creanceId);
				if (c === undefined) return [];
				return [
					{
						id: c.id,
						sens: c.sens,
						tiers: c.tiers,
						motif: c.motif,
						annulee: c.annuleeLe !== null
					}
				];
			}),
		operations: liens
			.filter((l) => l.pieceId === p.id)
			.flatMap((l) => {
				const op = operations.get(l.operationId);
				if (op === undefined) return [];
				return [
					{
						id: op.id,
						libelle: op.libelle,
						date: op.date,
						montant: montantOperation(op),
						annulee: op.annuleeLe !== null
					}
				];
			})
			.sort((a, b) => a.date.localeCompare(b.date))
	}));
}

/** « Cette Pièce sert aussi à 2 autres Opérations », rien si elle ne sert qu'ici. */
export function phraseAutres(autres: number): string | null {
	if (autres === 0) return null;
	return autres === 1
		? 'Cette Pièce sert aussi à 1 autre Opération'
		: `Cette Pièce sert aussi à ${autres} autres Opérations`;
}

export function phraseAutresOperations(piece: PieceVue, operationId: number | null): string | null {
	return phraseAutres(piece.operations.filter((o) => o.id !== operationId && !o.annulee).length);
}

export type FiltresPieces = {
	texte?: string;
	type?: 'image' | 'pdf';
	etat?: 'rattachee' | 'en_attente';
};

const plier = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function filtrerPieces(pieces: readonly PieceVue[], f: FiltresPieces): PieceVue[] {
	const texte = plier(f.texte?.trim() ?? '');
	return pieces.filter((p) => {
		if (f.type === 'pdf' && p.mime !== 'application/pdf') return false;
		if (f.type === 'image' && p.mime === 'application/pdf') return false;
		if (f.etat === 'en_attente' && estRattachee(p)) return false;
		if (f.etat === 'rattachee' && !estRattachee(p)) return false;
		if (texte === '') return true;
		return [
			p.nomOriginal,
			...p.operations.map((o) => o.libelle),
			...p.sommes.flatMap((c) => [c.tiers, c.motif])
		].some((t) => plier(t).includes(texte));
	});
}

/** Les Pièces en attente d'abord : elles demandent un geste. Puis les plus récentes. */
export function trierPieces(pieces: readonly PieceVue[]): PieceVue[] {
	return [...pieces].sort(
		(a, b) =>
			Number(estRattachee(a)) - Number(estRattachee(b)) ||
			b.creeLe.localeCompare(a.creeLe) ||
			b.id - a.id
	);
}
