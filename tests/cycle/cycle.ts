/**
 * Cycle de version (AD-23, story 6.5), avec le vrai restic, dans la vraie image :
 * base de la version précédente, montée de version, sauvegarde, refus à côté du serveur,
 * restauration sur une installation vierge, `ape verifier`, redémarrage.
 * La moindre étape en échec arrête tout, avec un code non nul : la CI de version ne produit rien.
 *
 * Usage : pnpm test:cycle [image] (construit l'image courante si elle n'est pas donnée).
 * Sans étiquette `v*` avant HEAD, c'est la première version : la base vient du code courant.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOT_DE_PASSE = 'mot-de-passe-du-cycle-fictif';
const suffixe = process.pid.toString(36);
const volumes = {
	source: `ape-cycle-source-${suffixe}`,
	cible: `ape-cycle-cible-${suffixe}`,
	depot: `ape-cycle-depot-${suffixe}`
};
const serveur = `ape-cycle-serveur-${suffixe}`;
const temporaire = mkdtempSync(join(tmpdir(), 'ape-cycle-'));
const racine = process.cwd();

function etape(nom: string) {
	console.log(`\n=== ${nom}`);
}

function lancer(commande: string, args: string[], cwd = racine) {
	return execFileSync(commande, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});
}

function essayer(commande: string, args: string[]) {
	return spawnSync(commande, args, { encoding: 'utf8' });
}

function versionPrecedente(): string | null {
	const r = essayer('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD^']);
	return r.status === 0 ? r.stdout.trim() : null;
}

/** La base d'une version antérieure, écrite par le code de cette version-là. */
function preparerBase(dossier: string) {
	const tag = versionPrecedente();
	if (tag === null) {
		console.log('Première version : la base vient du code courant.');
		lancer('node', ['tests/cycle/preparer.ts', dossier]);
		return;
	}
	console.log(`Base écrite par ${tag}.`);
	const arbre = join(temporaire, 'precedente');
	lancer('git', ['worktree', 'add', '--detach', arbre, tag]);
	try {
		lancer('pnpm', ['install', '--frozen-lockfile'], arbre);
		lancer('node', ['tests/cycle/preparer.ts', dossier], arbre);
	} finally {
		lancer('git', ['worktree', 'remove', '--force', arbre]);
	}
}

const environnement = (depot = '/depot') => [
	'-e',
	`RESTIC_PASSWORD=${MOT_DE_PASSE}`,
	'-e',
	`RESTIC_REPOSITORY=${depot}`,
	'-e',
	'ORIGIN=https://cycle.exemple.org'
];

const conteneur = (volume: string, image: string, commande: string[]) => [
	'run',
	'--rm',
	...environnement(),
	'-v',
	`${volume}:/data`,
	'-v',
	`${volumes.depot}:/depot`,
	image,
	...commande
];

/** Un volume neuf est à root : le premier passage le donne à l'utilisateur de l'image. */
function preparerVolumes(image: string) {
	for (const v of Object.values(volumes)) lancer('docker', ['volume', 'create', v]);
	lancer('docker', [
		'run',
		'--rm',
		'--user',
		'root',
		'-v',
		`${volumes.depot}:/depot`,
		image,
		'chown',
		'node:node',
		'/depot'
	]);
}

function copierDansVolume(dossier: string, volume: string, image: string) {
	const archive = join(temporaire, 'base.tar');
	execFileSync('tar', ['-cf', archive, '-C', dossier, '.'], {
		// Sur macOS, sans cela, chaque fichier traîne son double `._`.
		env: { ...process.env, COPYFILE_DISABLE: '1' }
	});
	lancer('docker', [
		'run',
		'--rm',
		'--user',
		'root',
		'-v',
		`${volume}:/data`,
		'-v',
		`${temporaire}:/entree:ro`,
		image,
		'sh',
		'-c',
		'tar --warning=no-unknown-keyword -xf /entree/base.tar -C /data && chown -R node:node /data'
	]);
}

/** Tout ce qui compte, en une empreinte : si un chiffre ou un fichier bouge, elle change. */
const EMPREINTE = `
const Database = require('/app/node_modules/better-sqlite3');
const { createHash } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const b = new Database('/data/base.sqlite', { readonly: true });
const h = createHash('sha256');
for (const t of ['operation', 'cote', 'ligne', 'liaison', 'reglement', 'creance_dette', 'piece',
	'pointage', 'ligne_releve', 'constat_solde', 'cloture_exercice', 'exercice', 'compte', 'acces']) {
	h.update(t + JSON.stringify(b.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all()));
}
let n = 0;
for (const f of readdirSync('/data/fichiers', { recursive: true, withFileTypes: true })) {
	if (!f.isFile()) continue;
	n += 1;
	h.update(f.name + createHash('sha256').update(readFileSync(f.parentPath + '/' + f.name)).digest('hex'));
}
const operations = b.prepare('SELECT count(*) FROM operation').pluck().get();
console.log(JSON.stringify({ operations, fichiers: n, empreinte: h.digest('hex') }));
`;

function empreinte(volume: string, image: string) {
	return lancer('docker', [...conteneur(volume, image, ['node', '-e', EMPREINTE])]).trim();
}

function exiger(condition: boolean, message: string) {
	if (!condition) throw new Error(message);
}

function nettoyer() {
	essayer('docker', ['rm', '--force', serveur]);
	for (const v of Object.values(volumes)) essayer('docker', ['volume', 'rm', '--force', v]);
	rmSync(temporaire, { recursive: true, force: true });
}

async function attendreSante() {
	for (let i = 0; i < 60; i++) {
		const r = essayer('docker', [
			'exec',
			serveur,
			'node',
			'-e',
			"fetch('http://127.0.0.1:3000/sante').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
		]);
		if (r.status === 0) return;
		await new Promise((f) => setTimeout(f, 500));
	}
	throw new Error('Le serveur ne répond pas sur /sante.');
}

async function principal() {
	const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
	let [image] = process.argv.slice(2);
	if (!image) {
		etape('Construction de l’image');
		image = `ape-compta:cycle-${version}`;
		lancer('docker', ['build', '--tag', image, '.']);
	}
	console.log(lancer('docker', ['run', '--rm', image, 'restic', 'version']).trim());
	preparerVolumes(image);

	etape('Base de la version précédente');
	const dossier = join(temporaire, 'instance');
	preparerBase(dossier);
	copierDansVolume(dossier, volumes.source, image);

	etape('Montée de version, puis ape verifier');
	console.log(lancer('docker', conteneur(volumes.source, image, ['ape', 'verifier'])).trim());
	const avant = empreinte(volumes.source, image);
	console.log(avant);
	exiger(JSON.parse(avant).operations > 0, 'La base montée est vide.');

	etape('Sauvegarde');
	console.log(lancer('docker', conteneur(volumes.source, image, ['ape', 'sauvegarder'])).trim());

	etape('Restauration refusée à côté du serveur');
	lancer('docker', [
		'run',
		'--detach',
		'--name',
		serveur,
		...environnement(),
		'-e',
		'APE_SAUVEGARDE=0',
		'-v',
		`${volumes.source}:/data`,
		image
	]);
	await attendreSante();
	const refus = essayer('docker', conteneur(volumes.source, image, ['ape', 'restaurer']));
	exiger(refus.status === 1, `Restauration acceptée à côté du serveur : ${refus.status}`);
	exiger(
		refus.stderr.includes('L’application tourne encore'),
		`Message inattendu : ${refus.stderr}`
	);
	console.log(refus.stderr.trim());
	lancer('docker', ['stop', serveur]);
	lancer('docker', ['rm', serveur]);

	etape('Restauration sur une installation vierge');
	console.log(lancer('docker', conteneur(volumes.cible, image, ['ape', 'restaurer'])).trim());
	const apres = empreinte(volumes.cible, image);
	console.log(apres);
	exiger(avant === apres, 'La restauration ne rend pas les mêmes données.');

	etape('ape verifier sur la copie restaurée');
	console.log(lancer('docker', conteneur(volumes.cible, image, ['ape', 'verifier'])).trim());

	etape('L’instance restaurée démarre');
	lancer('docker', [
		'run',
		'--detach',
		'--name',
		serveur,
		...environnement(),
		'-e',
		'APE_SAUVEGARDE=0',
		'-v',
		`${volumes.cible}:/data`,
		image
	]);
	await attendreSante();
	console.log('\nCycle complet.');
}

try {
	await principal();
} catch (e) {
	console.error(`\nCycle en échec : ${e instanceof Error ? e.message : String(e)}`);
	process.exitCode = 1;
} finally {
	nettoyer();
}
