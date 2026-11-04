import Database from 'better-sqlite3';

export type Base = Database.Database;

/** Une seule connexion dans le process (AD-13). PRAGMA de SCHEMA-DONNEES.md §1. */
export function ouvrirBase(chemin: string): Base {
	const base = new Database(chemin);
	base.pragma('foreign_keys = ON');
	base.pragma('journal_mode = WAL');
	base.pragma('busy_timeout = 5000');
	base.pragma('synchronous = NORMAL');
	return base;
}
