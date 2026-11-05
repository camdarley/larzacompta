import type { DepotCreances } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

/** Seul chemin vers `creance_dette` et `reglement` (AD-7). Le reste dû n'est stocké nulle part. */
export function creerDepotCreances(base: Base): DepotCreances {
	const r = {
		creer: base.prepare(`
			INSERT INTO creance_dette
				(sens, tiers, motif, montant_centimes, date, action_id, note, cree_le, cree_par, facture_id)
			VALUES (@sens, @tiers, @motif, @montant, @date, @actionId, @note, @creeLe, @creePar, @factureId)
		`),
		annuler: base.prepare(
			'UPDATE creance_dette SET annulee_le = ?, annulee_par = ? WHERE id = ? AND annulee_le IS NULL'
		),
		retablir: base.prepare(
			'UPDATE creance_dette SET annulee_le = NULL, annulee_par = NULL WHERE id = ?'
		),
		regler: base.prepare(
			'INSERT INTO reglement (creance_dette_id, operation_id, montant_centimes) VALUES (?, ?, ?)'
		)
	};

	return {
		creer: (c) => Number(r.creer.run({ factureId: null, ...c }).lastInsertRowid),
		annuler: (id, le, par) => void r.annuler.run(le, par, id),
		retablir: (id) => void r.retablir.run(id),
		regler: (creanceId, operationId, montant) => void r.regler.run(creanceId, operationId, montant)
	};
}
