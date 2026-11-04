/** Une règle métier ne lève pas d'exception : elle renvoie un Resultat. */
export type ErreurMetier = {
	code: string;
	details?: Record<string, unknown>;
};

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; erreur: ErreurMetier };

export function succes<T>(valeur: T): Resultat<T> {
	return { ok: true, valeur };
}

export function echec<T = never>(code: string, details?: Record<string, unknown>): Resultat<T> {
	return { ok: false, erreur: details ? { code, details } : { code } };
}
