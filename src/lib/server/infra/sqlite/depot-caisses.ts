import type { DepotCaisses } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

/** Seul chemin vers `session_caisse`, `comptage` et `comptage_coupure` (AD-7). */
export function creerDepotCaisses(base: Base): DepotCaisses {
	const r = {
		creerSession: base.prepare(`
			INSERT INTO session_caisse (compte_id, action_id, ouverte_le, ouverte_par)
			VALUES (@compteId, @actionId, @ouverteLe, @ouvertePar)
		`),
		cloturer: base.prepare(`
			UPDATE session_caisse SET cloturee_le = ?, cloturee_par = ?, operation_recette_id = ?
			WHERE id = ?
		`),
		rouvrir: base.prepare(`
			UPDATE session_caisse SET cloturee_le = NULL, cloturee_par = NULL, operation_recette_id = NULL
			WHERE id = ?
		`),
		creerComptage: base.prepare(`
			INSERT INTO comptage
				(compte_id, session_caisse_id, type, date, compte_le, saisi_le, saisi_par)
			VALUES (@compteId, @sessionCaisseId, @type, @date, @compteLe, @saisiLe, @saisiPar)
		`),
		corriger: base.prepare(`
			UPDATE comptage SET date = @date, saisi_le = @saisiLe, saisi_par = @saisiPar
			WHERE id = @id
		`),
		lierEcart: base.prepare('UPDATE comptage SET operation_ecart_id = ? WHERE id = ?'),
		viderCoupures: base.prepare('DELETE FROM comptage_coupure WHERE comptage_id = ?'),
		creerCoupure: base.prepare(
			'INSERT INTO comptage_coupure (comptage_id, coupure_centimes, quantite) VALUES (?, ?, ?)'
		)
	};

	function ecrireCoupures(id: number, coupures: readonly { coupure: number; quantite: number }[]) {
		for (const c of coupures) r.creerCoupure.run(id, c.coupure, c.quantite);
	}

	return {
		creerSession: (s) => Number(r.creerSession.run(s).lastInsertRowid),
		cloturerSession: (id, le, par, recetteId) => void r.cloturer.run(le, par, recetteId, id),
		rouvrirSession: (id) => void r.rouvrir.run(id),
		creerComptage({ coupures, ...c }) {
			const id = Number(r.creerComptage.run(c).lastInsertRowid);
			ecrireCoupures(id, coupures);
			return id;
		},
		corrigerComptage(id, { coupures, ...c }) {
			r.corriger.run({ id, ...c });
			r.viderCoupures.run(id);
			ecrireCoupures(id, coupures);
		},
		lierEcart: (id, operationId) => void r.lierEcart.run(operationId, id)
	};
}
