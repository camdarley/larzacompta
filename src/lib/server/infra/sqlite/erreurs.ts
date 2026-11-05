import Database from 'better-sqlite3';
import type { ErreurMetier } from '#lib/domaine/resultat.ts';

/** Codes levés par les triggers de verrouillage de `migrations/`. */
const CODES_TRIGGER = new Set([
	'exercice_cloture',
	'ancre_invalide',
	'operation_non_supprimable',
	'cote_pointe',
	'pointage_fige',
	'journal_immuable',
	'facture_validee'
]);

/**
 * Seul endroit qui traduit une erreur SQLite en ErreurMetier (AD-13).
 * Renvoie null pour une panne : elle reste une exception.
 */
export function traduireErreurSqlite(erreur: unknown): ErreurMetier | null {
	if (!(erreur instanceof Database.SqliteError)) return null;
	if (erreur.code === 'SQLITE_CONSTRAINT_TRIGGER' && CODES_TRIGGER.has(erreur.message)) {
		return { code: erreur.message };
	}
	if (
		erreur.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
		erreur.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
	) {
		const colonne = /UNIQUE constraint failed: (.+)$/.exec(erreur.message)?.[1];
		return { code: 'deja_utilise', details: colonne ? { colonne } : undefined };
	}
	if (erreur.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return { code: 'element_utilise' };
	return null;
}
