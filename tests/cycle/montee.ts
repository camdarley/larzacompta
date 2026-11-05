/**
 * Prouve la branche « depuis l'étiquette précédente » de `cycle.ts` sans attendre une vraie
 * version : dans un clone jetable, l'état courant devient une version étiquetée, puis un commit
 * ajoute une migration. Le cycle doit réussir. Avec une migration fausse, il doit échouer.
 * Rien ne touche le dépôt d'origine : ni étiquette, ni commit.
 *
 * Usage : pnpm test:cycle:montee
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const clone = mkdtempSync(join(tmpdir(), 'ape-montee-'));
const git = (...args: string[]) =>
	execFileSync(
		'git',
		['-c', 'user.name=Cycle fictif', '-c', 'user.email=cycle@exemple.org', ...args],
		{ cwd: clone, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
	);

const MIGRATION = join(clone, 'migrations/0099_essai_montee.sql');

function cycle() {
	return spawnSync(process.execPath, ['tests/cycle/cycle.ts'], {
		cwd: clone,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function versionSuivante(version: string, sql: string, message: string) {
	writeFileSync(MIGRATION, sql);
	const manifeste = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8'));
	manifeste.version = version;
	writeFileSync(join(clone, 'package.json'), `${JSON.stringify(manifeste, null, '\t')}\n`);
	git('add', 'migrations', 'package.json');
	git('commit', '--quiet', '-m', message);
}

try {
	execFileSync('git', ['clone', '--quiet', process.cwd(), clone]);
	// Le cycle essayé est celui de l'arbre de travail, même pas encore commité.
	copyFileSync('tests/cycle/cycle.ts', join(clone, 'tests/cycle/cycle.ts'));
	git('add', 'tests/cycle/cycle.ts');
	git('commit', '--quiet', '--allow-empty', '-m', 'essai : version étiquetée');
	git('tag', 'v0.0.1');

	console.log('=== Version suivante, migration juste');
	versionSuivante(
		'0.0.2',
		`ALTER TABLE compte ADD COLUMN note_essai TEXT;
CREATE TABLE essai_montee (id INTEGER PRIMARY KEY, operations INTEGER NOT NULL);
INSERT INTO essai_montee (operations) SELECT count(*) FROM operation;
`,
		'essai : ajouter une migration'
	);
	const juste = cycle();
	console.log(juste.stdout);
	if (juste.status !== 0) {
		throw new Error(`Le cycle aurait dû réussir.\n${juste.stderr.slice(-2000)}`);
	}
	if (!juste.stdout.includes('Base écrite par v0.0.1.')) {
		throw new Error('La branche de la version précédente n’a pas été prise.');
	}

	console.log('=== Version suivante, migration fausse');
	versionSuivante('0.0.3', 'ALTER TABLE table_absente ADD COLUMN x TEXT;\n', 'essai : fausser');
	const fausse = cycle();
	if (fausse.status === 0) throw new Error('Le cycle aurait dû échouer.');
	if (!fausse.stderr.includes('table_absente')) {
		throw new Error(`Échec sans la raison attendue.\n${fausse.stderr.slice(-2000)}`);
	}
	console.log(`Cycle refusé, code ${fausse.status}, comme attendu.`);
	console.log('\nMontée prouvée.');
} finally {
	rmSync(clone, { recursive: true, force: true });
}
