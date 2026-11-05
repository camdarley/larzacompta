/**
 * SM-3 : rejoue le contrôle sur les données privées de `.private/`.
 * Le dossier reste hors dépôt : sans lui, le script se saute sans erreur.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const dossier = '.private';
const present = existsSync(dossier) && readdirSync(dossier).length > 0;

if (!present) {
	console.log('test:prive : dossier .private/ vide ou absent, contrôle sauté.');
	process.exit(0);
}

const execution = spawnSync(
	process.execPath,
	['node_modules/vitest/vitest.mjs', 'run', '--project', 'prive'],
	{ stdio: 'inherit', env: { ...process.env, APE_JEU_PRIVE: '1' } }
);
process.exit(execution.status ?? 1);
