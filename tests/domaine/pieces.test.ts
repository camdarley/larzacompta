import { describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import {
	deciderPiece,
	depensesRecentesSansPiece,
	estPieceManquante,
	filtrerPieces,
	formatDePiece,
	nomDePiece,
	phraseAutresOperations,
	piecesManquantes,
	porteUneDepense,
	TAILLE_MAX_PIECE,
	trierPieces,
	vuesPieces,
	type PieceStockee,
	type PieceVue
} from '#lib/domaine/pieces/index.ts';
import type { LigneJ, OperationJ } from '#lib/domaine/journal.ts';

const octets = (...valeurs: number[]) => new Uint8Array(valeurs);
const texte = (t: string) => new TextEncoder().encode(t);

const PNG = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0);
const WEBP = texte('RIFF0000WEBPVP8 ');
const PDF = texte('%PDF-1.7\n');

function ligne(montant: number, partiel: Partial<LigneJ> = {}): LigneJ {
	return {
		id: 1,
		operationId: 1,
		ordre: 1,
		montant: centimes(montant),
		estReduction: false,
		natureId: 1,
		actionId: null,
		exerciceRattachementId: 1,
		note: null,
		...partiel
	};
}

function operation(partiel: Partial<OperationJ> = {}): OperationJ {
	return {
		id: 1,
		genre: 'standard',
		origine: 'saisie',
		date: '2026-10-05',
		libelle: 'Papeterie',
		reference: null,
		modePaiement: null,
		note: null,
		tiers: null,
		liaisonId: null,
		sansPiece: false,
		version: 1,
		creeLe: '2026-10-05T10:00:00.000Z',
		annuleeLe: null,
		cotes: [{ id: 1, operationId: 1, compteId: 1, date: '2026-10-05', montant: centimes(-2000) }],
		lignes: [ligne(-2000)],
		pieces: [],
		...partiel
	};
}

const PIECE = { id: 1, sha256: 'abc', nomOriginal: 'ticket.pdf', mime: 'application/pdf' };
const AUCUNE = new Set<number>();

describe('format d’une Pièce, lu sur les octets', () => {
	it.each([
		['PDF', PDF, 'application/pdf'],
		['JPEG', JPEG, 'image/jpeg'],
		['PNG', PNG, 'image/png'],
		['WebP', WEBP, 'image/webp']
	])('reconnaît %s', (_, o, mime) => {
		expect(formatDePiece(o)).toBe(mime);
		expect(deciderPiece(o)).toEqual({ ok: true, valeur: mime });
	});

	it('refuse un faux PNG, même nommé .png', () => {
		expect(formatDePiece(texte('<html>'))).toBeNull();
		expect(formatDePiece(texte('RIFF0000WAVE'))).toBeNull();
		expect(deciderPiece(texte('<svg>')).ok).toBe(false);
	});

	it('refuse un fichier vide ou de plus de 20 Mio, accepte 20 Mio tout juste', () => {
		const juste = new Uint8Array(TAILLE_MAX_PIECE);
		juste.set(PDF);
		const trop = new Uint8Array(TAILLE_MAX_PIECE + 1);
		trop.set(PDF);
		expect(deciderPiece(juste).ok).toBe(true);
		expect(deciderPiece(trop)).toEqual({ ok: false, erreur: { code: 'piece_refusee' } });
		expect(deciderPiece(new Uint8Array(0)).ok).toBe(false);
	});

	it('garde du nom ce qui s’affiche, jamais un chemin', () => {
		expect(nomDePiece('../../etc/passwd')).toBe('passwd');
		expect(nomDePiece('C:\\photos\\ticket.jpg')).toBe('ticket.jpg');
		expect(nomDePiece(' a\u0000b.pdf ')).toBe('ab.pdf');
		expect(nomDePiece('')).toBe('piece');
		expect(nomDePiece('x'.repeat(300))).toHaveLength(200);
	});
});

describe('F6 : Pièce manquante', () => {
	it('F6 : une dépense saisie sans Pièce manque', () => {
		expect(estPieceManquante(operation(), AUCUNE)).toBe(true);
	});

	it('F6 : ni annulée, ni autre origine, ni dispensée, ni déjà justifiée', () => {
		expect(estPieceManquante(operation({ annuleeLe: '2026-10-06T10:00:00.000Z' }), AUCUNE)).toBe(
			false
		);
		expect(estPieceManquante(operation({ origine: 'ajustement' }), AUCUNE)).toBe(false);
		expect(estPieceManquante(operation({ sansPiece: true }), AUCUNE)).toBe(false);
		expect(estPieceManquante(operation({ pieces: [PIECE] }), AUCUNE)).toBe(false);
	});

	it('F6 : une recette, un remboursement ou un Mouvement interne ne demandent rien', () => {
		expect(estPieceManquante(operation({ lignes: [ligne(2000)] }), AUCUNE)).toBe(false);
		expect(
			estPieceManquante(operation({ lignes: [ligne(2000, { estReduction: true })] }), AUCUNE)
		).toBe(false);
		expect(estPieceManquante(operation({ genre: 'interne', lignes: [] }), AUCUNE)).toBe(false);
	});

	it('F6 : une recette avec une Ligne de frais demande sa Pièce', () => {
		const buvette = operation({ lignes: [ligne(5000), ligne(-1000)] });
		expect(estPieceManquante(buvette, AUCUNE)).toBe(true);
	});

	it('F6 : une somme rendue, de Nature neutre, n’est pas une dépense', () => {
		expect(estPieceManquante(operation(), new Set([1]))).toBe(false);
		expect(porteUneDepense(operation(), new Set([1]))).toBe(false);
		expect(porteUneDepense(operation(), AUCUNE)).toBe(true);
	});

	it('trie par date, et s’en tient à l’Exercice regardé', () => {
		const a = operation({ id: 1, date: '2026-10-05' });
		const b = operation({ id: 2, date: '2026-09-02' });
		const c = operation({ id: 3, date: '2026-09-02' });
		const hors = operation({ id: 4, date: '2026-03-01' });
		const j = { operations: [a, b, c, hors] };
		const exercice = { debut: '2026-09-01', fin: '2027-08-31' };
		expect(piecesManquantes(j, AUCUNE, exercice).map((o) => o.id)).toEqual([2, 3, 1]);
		expect(piecesManquantes(j, AUCUNE, null).map((o) => o.id)).toEqual([4, 2, 3, 1]);
		expect(piecesManquantes(j, AUCUNE, { debut: null, fin: null })).toHaveLength(4);
	});

	it('propose d’abord les dépenses les plus récentes', () => {
		const j = {
			operations: [
				operation({ id: 1, date: '2026-09-02' }),
				operation({ id: 2, date: '2026-10-02' })
			]
		};
		expect(depensesRecentesSansPiece(j, AUCUNE, 1).map((o) => o.id)).toEqual([2]);
	});
});

describe('lecture des Pièces', () => {
	const stockee = (partiel: Partial<PieceStockee> = {}): PieceStockee => ({
		...PIECE,
		tailleOctets: 10,
		creeLe: '2026-10-05T10:00:00.000Z',
		...partiel
	});
	const op = (id: number, libelle: string, date = '2026-10-05') => operation({ id, libelle, date });

	it('relie chaque Pièce à ses Opérations, annulées comprises', () => {
		const [p] = vuesPieces(
			[stockee()],
			[
				{ pieceId: 1, operationId: 1 },
				{ pieceId: 1, operationId: 2 },
				{ pieceId: 1, operationId: 9 }
			],
			{
				operations: [op(1, 'A', '2026-10-05')],
				operationsAnnulees: [{ ...op(2, 'B', '2026-09-05'), annuleeLe: '2026-10-06T10:00:00.000Z' }]
			}
		);
		expect(p?.operations.map((o) => [o.libelle, o.annulee])).toEqual([
			['B', true],
			['A', false]
		]);
	});

	it('dit à combien d’autres Opérations sert une Pièce', () => {
		const autre = { libelle: 'x', date: '2026-10-05', montant: centimes(1), annulee: false };
		const trois: PieceVue = {
			...stockee(),
			operations: [1, 2, 3].map((id) => ({ ...autre, id })),
			sommes: []
		};
		expect(phraseAutresOperations(trois, 1)).toBe('Cette Pièce sert aussi à 2 autres Opérations');
		expect(phraseAutresOperations({ ...trois, operations: trois.operations.slice(0, 2) }, 1)).toBe(
			'Cette Pièce sert aussi à 1 autre Opération'
		);
		expect(phraseAutresOperations({ ...trois, operations: [{ ...autre, id: 1 }] }, 1)).toBeNull();
		expect(
			phraseAutresOperations({ ...trois, operations: [{ ...autre, id: 2, annulee: true }] }, 1)
		).toBeNull();
	});

	it('filtre par texte, type et état, sans tenir compte des accents', () => {
		const lien = {
			id: 1,
			libelle: 'Goûter de Noël',
			date: '2026-10-05',
			montant: centimes(1),
			annulee: false
		};
		const pieces: PieceVue[] = [
			{ ...stockee({ id: 1, nomOriginal: 'facture.pdf' }), operations: [lien], sommes: [] },
			{
				...stockee({ id: 2, nomOriginal: 'ticket.jpg', mime: 'image/jpeg' }),
				operations: [],
				sommes: []
			}
		];
		const ids = (f: Parameters<typeof filtrerPieces>[1]) =>
			filtrerPieces(pieces, f).map((p) => p.id);
		expect(ids({})).toEqual([1, 2]);
		expect(ids({ texte: 'gouter' })).toEqual([1]);
		expect(ids({ texte: 'TICKET' })).toEqual([2]);
		expect(ids({ type: 'pdf' })).toEqual([1]);
		expect(ids({ type: 'image' })).toEqual([2]);
		expect(ids({ etat: 'en_attente' })).toEqual([2]);
		expect(ids({ etat: 'rattachee' })).toEqual([1]);
	});

	it('une Pièce jointe à une Dette seule est rattachée, et se trouve par son tiers', () => {
		const dette = {
			id: 4,
			sens: 'dette' as const,
			tiers: 'Autocars Causse',
			motif: 'Cross',
			annulee: false
		};
		const pieces: PieceVue[] = [
			{
				...stockee({ id: 1, creeLe: '2026-10-09T10:00:00.000Z' }),
				operations: [],
				sommes: [dette]
			},
			{ ...stockee({ id: 2, creeLe: '2026-10-01T10:00:00.000Z' }), operations: [], sommes: [] }
		];
		expect(filtrerPieces(pieces, { etat: 'rattachee' }).map((p) => p.id)).toEqual([1]);
		expect(filtrerPieces(pieces, { etat: 'en_attente' }).map((p) => p.id)).toEqual([2]);
		expect(filtrerPieces(pieces, { texte: 'causse' }).map((p) => p.id)).toEqual([1]);
		expect(trierPieces(pieces).map((p) => p.id)).toEqual([2, 1]);
	});

	it('met en tête ce qui attend un rattachement, puis le plus récent', () => {
		const lien = { id: 1, libelle: 'A', date: '2026-10-05', montant: centimes(1), annulee: false };
		const pieces: PieceVue[] = [
			{ ...stockee({ id: 1, creeLe: '2026-10-09T10:00:00.000Z' }), operations: [lien], sommes: [] },
			{ ...stockee({ id: 2, creeLe: '2026-10-01T10:00:00.000Z' }), operations: [], sommes: [] },
			{ ...stockee({ id: 3, creeLe: '2026-10-02T10:00:00.000Z' }), operations: [], sommes: [] }
		];
		expect(trierPieces(pieces).map((p) => p.id)).toEqual([3, 2, 1]);
	});
});
