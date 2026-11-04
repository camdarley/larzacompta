import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Base } from './connexion.ts';

export type Migration = { nom: string; sql: string };

const COPIES_GARDEES = 3;

export class ErreurMigration extends Error {
	constructor(nom: string, cause: unknown) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		super(
			`La migration ${nom} a échoué : ${detail}. La base reste intacte, le démarrage s'arrête.`
		);
		this.name = 'ErreurMigration';
	}
}

export function chargerMigrations(dossier: string): Migration[] {
	return readdirSync(dossier)
		.filter((f) => /^\d{4}_.+\.sql$/.test(f))
		.sort()
		.map((nom) => ({ nom, sql: readFileSync(join(dossier, nom), 'utf8') }));
}

function dejaAppliquees(base: Base): Set<string> {
	base.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		nom TEXT PRIMARY KEY,
		appliquee_le TEXT NOT NULL
	)`);
	const lignes = base.prepare('SELECT nom FROM schema_migrations').all() as { nom: string }[];
	return new Set(lignes.map((l) => l.nom));
}

function copierAvantMigration(base: Base, dossier: string, horodatage: string) {
	mkdirSync(dossier, { recursive: true });
	const nom = `avant-${horodatage.replace(/[:.]/g, '-')}.sqlite`;
	base.prepare('VACUUM INTO ?').run(join(dossier, nom));
	const copies = readdirSync(dossier)
		.filter((f) => f.startsWith('avant-') && f.endsWith('.sqlite'))
		.sort();
	for (const ancienne of copies.slice(0, -COPIES_GARDEES)) {
		rmSync(join(dossier, ancienne));
	}
}

export type OptionsMigration = {
	/** Absent en mémoire : aucune copie n'a de sens. */
	dossierCopies?: string;
	horodatage: string;
};

/** En avant seulement. Une copie est prise avant toute migration d'une base déjà utilisée. */
export function appliquerMigrations(
	base: Base,
	migrations: readonly Migration[],
	options: OptionsMigration
): string[] {
	const faites = dejaAppliquees(base);
	const enAttente = migrations.filter((m) => !faites.has(m.nom));
	if (enAttente.length === 0) return [];

	if (options.dossierCopies && faites.size > 0) {
		copierAvantMigration(base, options.dossierCopies, options.horodatage);
	}

	const noter = base.prepare('INSERT INTO schema_migrations (nom, appliquee_le) VALUES (?, ?)');
	for (const migration of enAttente) {
		const appliquer = base.transaction(() => {
			base.exec(migration.sql);
			noter.run(migration.nom, options.horodatage);
		});
		try {
			appliquer();
		} catch (cause) {
			throw new ErreurMigration(migration.nom, cause);
		}
	}
	return enAttente.map((m) => m.nom);
}
