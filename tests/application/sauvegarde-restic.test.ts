/** L'adaptateur restic, contre un faux `restic` scripté : le vrai tourne dans `tests/cycle/`. */
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ecrireBattement } from '#lib/server/infra/battement.ts';
import { creerArchiveur } from '#lib/server/infra/sauvegarde/index.ts';
import { restaurer } from '#lib/server/infra/sauvegarde/restauration.ts';
import { creerRestic } from '#lib/server/infra/sauvegarde/restic.ts';
import { ouvrirBase, type Base } from '#lib/server/infra/sqlite/connexion.ts';
import { creerSourceVersions } from '#lib/server/infra/version/index.ts';

let dossier: string;
let appels: string;
let base: Base;
let faux: string;

const env = (plus: Record<string, string> = {}) => ({
	PATH: process.env.PATH,
	RESTIC_PASSWORD: 'mot-de-passe-fictif',
	...plus
});

function fauxRestic(corps: string) {
	faux = join(dossier, 'faux-restic');
	writeFileSync(
		faux,
		`#!/bin/sh\necho "$RESTIC_REPOSITORY | $*" >> "${appels}"\n${corps}\nexit 0\n`
	);
	chmodSync(faux, 0o755);
}

const appelsNotes = () => readFileSync(appels, 'utf8').trim().split('\n');

const RESUME = `case "$1" in backup) echo '{"message_type":"status"}'; echo '{"message_type":"summary","snapshot_id":"abcd1234"}';; esac`;

beforeEach(() => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-restic-'));
	appels = join(dossier, 'appels');
	base = ouvrirBase(join(dossier, 'base.sqlite'));
	base.exec('CREATE TABLE t (a); INSERT INTO t VALUES (1)');
});
afterEach(() => base.close());

describe('archiveur', () => {
	it('copie la base, puis passe la copie et les fichiers à restic, dans cet ordre', async () => {
		fauxRestic(`${RESUME}\ncase "$1" in backup) cp "$7" "${dossier}/copie-vue";; esac`);
		const archiveur = creerArchiveur(base, dossier, creerRestic(dossier, env(), faux));
		const { instantane } = await archiveur.sauvegarder({ controler: true });
		expect(instantane).toBe('abcd1234');

		const [config, backup, forget, check] = appelsNotes();
		expect(config).toContain('cat config');
		expect(backup).toMatch(
			/backup --json --host ape --tag ape \S*copie\/base\.sqlite \S*fichiers$/
		);
		expect(forget).toContain('--keep-daily 14 --keep-monthly 24 --keep-yearly 10 --prune');
		expect(check).toContain('| check');
		expect(existsSync(join(dossier, 'copie-vue'))).toBe(true);
		const copie = ouvrirBase(join(dossier, 'copie-vue'));
		expect(copie.prepare('SELECT a FROM t').pluck().get()).toBe(1);
		copie.close();
	});

	it('ne laisse pas de copie en clair sur le disque, même en échec', async () => {
		fauxRestic(`case "$1" in backup) echo "panne" >&2; exit 1;; esac`);
		const archiveur = creerArchiveur(base, dossier, creerRestic(dossier, env(), faux));
		await expect(archiveur.sauvegarder({ controler: false })).rejects.toThrow('panne');
		expect(existsSync(join(dossier, 'sauvegardes', 'copie', 'base.sqlite'))).toBe(false);
	});

	it('crée le dépôt local chiffré sans RESTIC_REPOSITORY, sans copie hors du VPS', async () => {
		fauxRestic(`${RESUME}\ncase "$1" in cat) exit 10;; esac`);
		const restic = creerRestic(dossier, env(), faux);
		expect(restic.horsVps).toBe(false);
		await creerArchiveur(base, dossier, restic).sauvegarder({ controler: false });
		const [config, init] = appelsNotes();
		expect(config).toContain(`${join(dossier, 'sauvegardes', 'depot')} | cat config`);
		expect(init).toContain('| init');
	});

	it('vise le dépôt distant fourni, sans réinitialiser un dépôt existant', async () => {
		fauxRestic(RESUME);
		const restic = creerRestic(dossier, env({ RESTIC_REPOSITORY: 's3:exemple.org/seau' }), faux);
		expect(restic.horsVps).toBe(true);
		await creerArchiveur(base, dossier, restic).sauvegarder({ controler: false });
		expect(appelsNotes()[0]).toContain('s3:exemple.org/seau | cat config');
		expect(appelsNotes().join()).not.toContain('init');
	});

	it('ne laisse jamais le mot de passe dans un message', async () => {
		fauxRestic(`echo "échec avec mot-de-passe-fictif en clair" >&2; exit 1`);
		const archiveur = creerArchiveur(base, dossier, creerRestic(dossier, env(), faux));
		await expect(archiveur.sauvegarder({ controler: false })).rejects.toThrow(
			'échec avec *** en clair'
		);
	});

	it('explique un mot de passe absent et un restic introuvable', async () => {
		const sans = creerRestic(dossier, { PATH: process.env.PATH }, 'restic');
		await expect(
			creerArchiveur(base, dossier, sans).sauvegarder({ controler: false })
		).rejects.toThrow('RESTIC_PASSWORD manque');
		const introuvable = creerRestic(dossier, env(), join(dossier, 'nulle-part'));
		await expect(
			creerArchiveur(base, dossier, introuvable).sauvegarder({ controler: false })
		).rejects.toThrow('restic introuvable');
	});
});

describe('restauration', () => {
	const maintenant = '2026-11-05T12:00:00.000Z';
	let cible: string;

	/** Le faux `restore` dépose ce qu'aurait déposé restic : chemin absolu d'origine sous la cible. */
	const FAUX_RESTORE = `case "$1" in restore)
		d="$8/data"; mkdir -p "$d/sauvegardes/copie" "$d/fichiers/ab"
		echo base > "$d/sauvegardes/copie/base.sqlite"; echo piece > "$d/fichiers/ab/abcd";;
	esac`;

	beforeEach(() => {
		cible = join(dossier, 'cible');
		mkdirSync(cible);
		fauxRestic(FAUX_RESTORE);
	});

	const lancer = (options = {}) =>
		restaurer(cible, creerRestic(cible, env(), faux), {
			instantane: 'latest',
			remplacer: false,
			maintenant,
			...options
		});

	it('remet base et fichiers sur une installation vierge', async () => {
		expect((await lancer()).ok).toBe(true);
		expect(readFileSync(join(cible, 'base.sqlite'), 'utf8')).toBe('base\n');
		expect(readFileSync(join(cible, 'fichiers/ab/abcd'), 'utf8')).toBe('piece\n');
		expect(existsSync(join(cible, 'sauvegardes', 'restauration'))).toBe(false);
	});

	it('refuse tant que le serveur bat, puis accepte après son silence', async () => {
		ecrireBattement(cible, '2026-11-05T11:59:50.000Z');
		const r = await lancer();
		expect(r.ok === false && r.erreur.code).toBe('application_en_marche');
		expect(existsSync(appels)).toBe(false);
		expect((await lancer({ maintenant: '2026-11-05T12:00:30.000Z' })).ok).toBe(true);
	});

	it('refuse d’écraser une instance en place, sauf demande explicite qui la garde', async () => {
		writeFileSync(join(cible, 'base.sqlite'), 'ancienne');
		const r = await lancer();
		expect(r.ok === false && r.erreur.code).toBe('instance_en_place');
		expect((await lancer({ remplacer: true })).ok).toBe(true);
		const garde = join(cible, 'avant-restauration', '2026-11-05T12-00-00.000Z', 'base.sqlite');
		expect(readFileSync(garde, 'utf8')).toBe('ancienne');
		expect(readFileSync(join(cible, 'base.sqlite'), 'utf8')).toBe('base\n');
	});

	it('ne touche à rien si la sauvegarde ne contient pas de base', async () => {
		fauxRestic('');
		const r = await lancer();
		expect(r.ok === false && r.erreur.code).toBe('sauvegarde_sans_base');
		expect(existsSync(join(cible, 'base.sqlite'))).toBe(false);
	});
});

describe('source des versions', () => {
	const repondre = (corps: unknown, status = 200) =>
		(async () => new Response(JSON.stringify(corps), { status })) as typeof fetch;

	it('lit les deux formes publiées, sans identifiant', async () => {
		let init: RequestInit | undefined;
		const lire = (async (_u: string, i: RequestInit) => {
			init = i;
			return new Response('{"tag_name":"v1.2.3"}');
		}) as typeof fetch;
		expect(await creerSourceVersions('https://exemple.org', lire).derniere()).toBe('v1.2.3');
		expect(Object.keys(init?.headers ?? {})).toEqual(['accept']);
		const autre = repondre({ version: '1.2.4' });
		expect(await creerSourceVersions('https://exemple.org', autre).derniere()).toBe('1.2.4');
	});

	it('rend null sans adresse, sur une erreur ou un corps inattendu', async () => {
		const jamais = (async () => {
			throw new Error('appel interdit');
		}) as typeof fetch;
		expect(await creerSourceVersions('', jamais).derniere()).toBeNull();
		expect(await creerSourceVersions('https://exemple.org', jamais).derniere()).toBeNull();
		const u = 'https://exemple.org';
		expect(await creerSourceVersions(u, repondre({}, 500)).derniere()).toBeNull();
		expect(await creerSourceVersions(u, repondre({ tag_name: 3 })).derniere()).toBeNull();
	});
});
