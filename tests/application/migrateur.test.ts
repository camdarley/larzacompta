import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ouvrirBase, type Base } from '#lib/server/infra/sqlite/connexion.ts';
import {
	appliquerMigrations,
	chargerMigrations,
	ErreurBaseRecente,
	ErreurMigration
} from '#lib/server/infra/sqlite/migrateur.ts';

const H = (n: number) => `2026-11-04T10:00:0${n}.000Z`;
let dossier: string;
let base: Base;

beforeEach(() => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-migrations-'));
	base = ouvrirBase(join(dossier, 'base.sqlite'));
});

afterEach(() => {
	base.close();
	rmSync(dossier, { recursive: true, force: true });
});

const copies = () => join(dossier, 'avant-migration');

describe('migrateur', () => {
	it('crée toutes les tables et tous les triggers sur une base vide', () => {
		const faites = appliquerMigrations(base, chargerMigrations('migrations'), {
			dossierCopies: copies(),
			horodatage: H(1)
		});
		expect(faites).toEqual([
			'0001_jalon_1.sql',
			'0002_corrections_jalon_1.sql',
			'0003_jalon_2.sql',
			'0004_jalon_3.sql'
		]);
		const compter = (type: string) =>
			base.prepare(`SELECT count(*) FROM sqlite_master WHERE type = ?`).pluck().get(type);
		expect(compter('table')).toBeGreaterThanOrEqual(25);
		expect(compter('trigger')).toBe(45);
		expect(base.prepare('SELECT nom FROM schema_migrations').pluck().all()).toEqual([
			'0001_jalon_1.sql',
			'0002_corrections_jalon_1.sql',
			'0003_jalon_2.sql',
			'0004_jalon_3.sql'
		]);
		// Une base neuve n'a rien à protéger.
		expect(existsSync(copies())).toBe(false);
	});

	it('0003 s’applique sur une base du jalon 1 avec données, sans rien changer', () => {
		const toutes = chargerMigrations('migrations');
		const jalon1 = toutes.filter((m) => m.nom < '0003');
		appliquerMigrations(base, jalon1, { dossierCopies: copies(), horodatage: H(1) });
		base.exec(`
			INSERT INTO association (id, nom) VALUES (1, 'APE fictive');
			INSERT INTO acces (id, identifiant, nom_affiche, role, cree_le)
				VALUES (1, 'test', 'Personne fictive', 'tresorier', '2025-09-01T08:00:00.000Z');
			INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut)
				VALUES (1, '2026-2027', 2026, '2026-09-01', '2027-08-31', 'ouvert');
			INSERT INTO groupe (id, libelle, ordre) VALUES (1, 'Fonctionnement', 1);
			INSERT INTO nature (id, libelle, groupe_id) VALUES (1, 'Transport', 1);
			INSERT INTO compte (id, libelle, type) VALUES (1, 'Caisse', 'caisse');
			INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par) VALUES
				(1, 'standard', '2026-10-05', 'Ticket fictif', '2026-10-05T18:00:00.000Z', 1);
			INSERT INTO cote (id, operation_id, compte_id, date, montant_centimes)
				VALUES (1, 1, 1, '2026-10-05', -1000);
			INSERT INTO ligne (id, operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id)
				VALUES (1, 1, 1, -1000, 1, 1);
		`);
		const lire = () => ({
			operations: base.prepare('SELECT * FROM operation').all(),
			lignes: base.prepare('SELECT * FROM ligne').all(),
			cotes: base
				.prepare('SELECT id, operation_id, compte_id, date, montant_centimes FROM cote')
				.all()
		});
		const avant = lire();
		appliquerMigrations(base, toutes, { dossierCopies: copies(), horodatage: H(2) });
		expect(lire()).toEqual(avant);
		expect(base.prepare('SELECT session_caisse_id, session_phase FROM cote').get()).toEqual({
			session_caisse_id: null,
			session_phase: null
		});
		expect(
			base.prepare(`SELECT libelle FROM compte WHERE type = 'cheques_a_remettre'`).pluck().all()
		).toEqual(['Chèques à remettre']);
	});

	it('le Compte des chèques ne heurte pas un Compte du même nom', () => {
		const toutes = chargerMigrations('migrations');
		const jalon1 = toutes.filter((m) => m.nom < '0003');
		appliquerMigrations(base, jalon1, { dossierCopies: copies(), horodatage: H(1) });
		base.exec(`
			INSERT INTO association (id, nom) VALUES (1, 'APE fictive');
			INSERT INTO compte (libelle, type) VALUES ('Chèques à remettre', 'banque');
		`);
		appliquerMigrations(base, toutes, { dossierCopies: copies(), horodatage: H(2) });
		expect(
			base.prepare(`SELECT libelle FROM compte WHERE type = 'cheques_a_remettre'`).pluck().all()
		).toEqual(['Chèques à remettre (système)']);
	});

	it('applique les PRAGMA du schéma à chaque connexion', () => {
		expect(base.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(base.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(base.pragma('busy_timeout', { simple: true })).toBe(5000);
		expect(base.pragma('synchronous', { simple: true })).toBe(1);
	});

	it("n'applique jamais deux fois une migration", () => {
		const m = chargerMigrations('migrations');
		appliquerMigrations(base, m, { horodatage: H(1) });
		expect(appliquerMigrations(base, m, { horodatage: H(2) })).toEqual([]);
	});

	it('copie la base existante et ne garde que les trois dernières', () => {
		const options = (n: number) => ({ dossierCopies: copies(), horodatage: H(n) });
		const lot = [1, 2, 3, 4, 5].map((n) => ({
			nom: `000${n}_t.sql`,
			sql: `CREATE TABLE t${n} (id INTEGER)`
		}));
		for (let n = 1; n <= 5; n++) appliquerMigrations(base, lot.slice(0, n), options(n));
		const presentes = readdirSync(copies()).sort();
		expect(presentes).toHaveLength(3);
		expect(presentes[2]).toContain('2026-11-04T10-00-05');
		const copie = ouvrirBase(join(copies(), presentes[2] as string));
		const tables = copie
			.prepare(`SELECT name FROM sqlite_master WHERE name LIKE 't%'`)
			.pluck()
			.all();
		copie.close();
		expect(tables).toContain('t4');
		expect(tables).not.toContain('t5');
	});

	it('une migration qui échoue arrête avec un message clair et laisse la base intacte', () => {
		const a = { nom: '0001_a.sql', sql: 'CREATE TABLE a (id INTEGER)' };
		appliquerMigrations(base, [a], { horodatage: H(1) });
		const fautive = {
			nom: '0002_fautive.sql',
			sql: 'CREATE TABLE b (id INTEGER); INSERT INTO a (colonne_absente) VALUES (1);'
		};
		expect(() => appliquerMigrations(base, [a, fautive], { horodatage: H(2) })).toThrow(
			ErreurMigration
		);
		expect(() => appliquerMigrations(base, [a, fautive], { horodatage: H(2) })).toThrow(
			/0002_fautive\.sql a échoué/
		);
		const noms = base.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).pluck().all();
		expect(noms).toContain('a');
		expect(noms).not.toContain('b');
		expect(base.prepare('SELECT nom FROM schema_migrations').pluck().all()).toEqual(['0001_a.sql']);
	});

	it('un lot en échec ne laisse aucune de ses migrations appliquée', () => {
		const a = { nom: '0001_a.sql', sql: 'CREATE TABLE a (id INTEGER)' };
		const bonne = { nom: '0002_ok.sql', sql: 'CREATE TABLE ajout (id INTEGER)' };
		const fautive = { nom: '0003_ko.sql', sql: 'INSERT INTO table_absente VALUES (1)' };
		appliquerMigrations(base, [a], { horodatage: H(1) });
		expect(() => appliquerMigrations(base, [a, bonne, fautive], { horodatage: H(2) })).toThrow(
			/La base reste intacte/
		);
		expect(base.prepare('SELECT nom FROM schema_migrations').pluck().all()).toEqual(['0001_a.sql']);
		const noms = base.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).pluck().all();
		expect(noms).not.toContain('ajout');
	});

	it('refuse de démarrer sur une base plus récente que le code', () => {
		const a = { nom: '0001_a.sql', sql: 'CREATE TABLE a (id INTEGER)' };
		const b = { nom: '0002_b.sql', sql: 'CREATE TABLE b (id INTEGER)' };
		appliquerMigrations(base, [a, b], { horodatage: H(1) });
		expect(() => appliquerMigrations(base, [a], { horodatage: H(2) })).toThrow(ErreurBaseRecente);
		expect(() => appliquerMigrations(base, [a], { horodatage: H(2) })).toThrow(/restaurez/);
	});

	it('une requête sur une colonne inexistante échoue dès la préparation', () => {
		appliquerMigrations(base, chargerMigrations('migrations'), { horodatage: H(1) });
		expect(() => base.prepare('SELECT colonne_absente FROM compte')).toThrow(/no such column/);
	});
});
