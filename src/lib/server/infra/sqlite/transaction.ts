import { echec, type Resultat } from '#lib/domaine/resultat.ts';
import type { Transaction } from '../../application/ports.ts';
import type { Base } from './connexion.ts';
import { traduireErreurSqlite } from './erreurs.ts';

class Annulation extends Error {
	resultat: Resultat<never>;

	constructor(resultat: Resultat<never>) {
		super('annulation');
		this.resultat = resultat;
	}
}

/** Un échec métier annule la transaction ; une erreur de trigger devient un échec métier. */
export function creerTransaction(base: Base): Transaction {
	return function transaction<T>(f: () => Resultat<T>): Resultat<T> {
		const enveloppe = base.transaction((): T => {
			const r = f();
			if (!r.ok) throw new Annulation(r);
			return r.valeur;
		});
		try {
			// IMMEDIATE : l'écriture concurrente attend ici plutôt que d'échouer en cours de route.
			return { ok: true, valeur: enveloppe.immediate() };
		} catch (e) {
			if (e instanceof Annulation) return e.resultat;
			const metier = traduireErreurSqlite(e);
			if (metier) return echec(metier.code, metier.details);
			throw e;
		}
	};
}
