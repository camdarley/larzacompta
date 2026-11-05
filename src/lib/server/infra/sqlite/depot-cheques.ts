import type { DepotCheques } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

/** Seul chemin vers `cheque_recu`, `cheque_emis` et `remise` (AD-7). */
export function creerDepotCheques(base: Base): DepotCheques {
	const r = {
		creerRecu: base.prepare(`
			INSERT INTO cheque_recu (operation_id, emetteur, banque, numero)
			VALUES (@operationId, @emetteur, @banque, @numero)
		`),
		modifierRecu: base.prepare(
			'UPDATE cheque_recu SET emetteur = @emetteur, banque = @banque, numero = @numero WHERE id = @id'
		),
		remettre: base.prepare('UPDATE cheque_recu SET remise_id = ? WHERE id = ?'),
		liberer: base.prepare('UPDATE cheque_recu SET remise_id = NULL WHERE remise_id = ?'),
		definirRejet: base.prepare('UPDATE cheque_recu SET operation_rejet_id = ? WHERE id = ?'),
		dernierNumero: base.prepare('SELECT numero FROM remise ORDER BY numero DESC LIMIT 1').pluck(),
		creerRemise: base.prepare('INSERT INTO remise (numero, operation_id) VALUES (?, ?)'),
		creerEmis: base.prepare(`
			INSERT INTO cheque_emis (numero, beneficiaire, operation_id, annule_le, annule_par)
			VALUES (@numero, @beneficiaire, @operationId, @annuleLe, @annulePar)
		`),
		modifierEmis: base.prepare(
			'UPDATE cheque_emis SET numero = @numero, beneficiaire = @beneficiaire WHERE id = @id'
		),
		reprendreEmis: base.prepare(`
			UPDATE cheque_emis SET numero = @numero, beneficiaire = @beneficiaire,
				operation_id = @operationId, annule_le = NULL, annule_par = NULL
			WHERE id = @id
		`),
		annulerEmis: base.prepare('UPDATE cheque_emis SET annule_le = ?, annule_par = ? WHERE id = ?'),
		supprimerEmis: base.prepare('DELETE FROM cheque_emis WHERE id = ?')
	};

	return {
		creerRecu: (c) => Number(r.creerRecu.run(c).lastInsertRowid),
		modifierRecu: (id, c) => void r.modifierRecu.run({ id, ...c }),
		remettre: (chequeId, remiseId) => void r.remettre.run(remiseId, chequeId),
		liberer: (remiseId) => void r.liberer.run(remiseId),
		definirRejet: (chequeId, operationId) => void r.definirRejet.run(operationId, chequeId),
		dernierNumeroRemise: () => (r.dernierNumero.get() as number | undefined) ?? 0,
		creerRemise: ({ numero, operationId }) =>
			Number(r.creerRemise.run(numero, operationId).lastInsertRowid),
		creerEmis: (c) => Number(r.creerEmis.run(c).lastInsertRowid),
		modifierEmis: (id, c) => void r.modifierEmis.run({ id, ...c }),
		reprendreEmis: (id, c) => void r.reprendreEmis.run({ id, ...c }),
		annulerEmis: (id, le, par) => void r.annulerEmis.run(le, par, id),
		supprimerEmis: (id) => void r.supprimerEmis.run(id)
	};
}
