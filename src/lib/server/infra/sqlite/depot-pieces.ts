import type { PieceStockee } from '#lib/domaine/pieces/index.ts';
import type { DepotPieces } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type PieceBrute = {
	id: number;
	sha256: string;
	nom_original: string;
	mime: string;
	taille_octets: number;
	cree_le: string;
};

const versPiece = (p: PieceBrute): PieceStockee => ({
	id: p.id,
	sha256: p.sha256,
	nomOriginal: p.nom_original,
	mime: p.mime,
	tailleOctets: p.taille_octets,
	creeLe: p.cree_le
});

/** Seul chemin vers `piece`, `piece_operation` et `piece_creance_dette` (AD-7). */
export function creerDepotPieces(base: Base): DepotPieces {
	const r = {
		lister: base.prepare('SELECT * FROM piece ORDER BY id'),
		parId: base.prepare('SELECT * FROM piece WHERE id = ?'),
		parSha: base.prepare('SELECT * FROM piece WHERE sha256 = ?'),
		liens: base.prepare('SELECT piece_id, operation_id FROM piece_operation'),
		creer: base.prepare(`
			INSERT INTO piece (sha256, nom_original, mime, taille_octets, cree_le, cree_par)
			VALUES (@sha256, @nomOriginal, @mime, @tailleOctets, @creeLe, @creePar)
		`),
		rattacher: base.prepare(
			'INSERT OR IGNORE INTO piece_operation (piece_id, operation_id) VALUES (?, ?)'
		),
		detacher: base.prepare('DELETE FROM piece_operation WHERE piece_id = ? AND operation_id = ?'),
		liensSommes: base.prepare('SELECT piece_id, creance_dette_id FROM piece_creance_dette'),
		rattacherSomme: base.prepare(
			'INSERT OR IGNORE INTO piece_creance_dette (piece_id, creance_dette_id) VALUES (?, ?)'
		),
		detacherSomme: base.prepare(
			'DELETE FROM piece_creance_dette WHERE piece_id = ? AND creance_dette_id = ?'
		),
		supprimer: base.prepare('DELETE FROM piece WHERE id = ?')
	};

	const lire = (p: unknown) => (p === undefined ? null : versPiece(p as PieceBrute));

	return {
		lister: () => (r.lister.all() as PieceBrute[]).map(versPiece),
		parId: (id) => lire(r.parId.get(id)),
		parSha: (sha256) => lire(r.parSha.get(sha256)),
		liens: () =>
			(r.liens.all() as { piece_id: number; operation_id: number }[]).map((l) => ({
				pieceId: l.piece_id,
				operationId: l.operation_id
			})),
		creer: (p) => Number(r.creer.run(p).lastInsertRowid),
		rattacher: (pieceId, operationId) => r.rattacher.run(pieceId, operationId).changes > 0,
		detacher: (pieceId, operationId) => r.detacher.run(pieceId, operationId).changes > 0,
		liensSommes: () =>
			(r.liensSommes.all() as { piece_id: number; creance_dette_id: number }[]).map((l) => ({
				pieceId: l.piece_id,
				creanceId: l.creance_dette_id
			})),
		rattacherSomme: (pieceId, creanceId) => r.rattacherSomme.run(pieceId, creanceId).changes > 0,
		detacherSomme: (pieceId, creanceId) => r.detacherSomme.run(pieceId, creanceId).changes > 0,
		supprimer: (id) => void r.supprimer.run(id)
	};
}
