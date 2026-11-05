/**
 * Story 6.6 et critère `docker compose pull` de 6.1 : déroule les guides de `docs/`, commande par
 * commande, sur deux machines Linux vierges (`docker:dind`), ports 80 et 443 compris :
 * certificat par ACME (Pebble), dépôt S3 (rclone), dépôt SFTP (OpenSSH), registre d'images.
 * Ce sont les vrais protocoles, pas de vrais fournisseurs : tout reste sur ce poste.
 *
 * Usage : pnpm test:machine-vierge (GARDER=1 laisse les conteneurs en place après un échec).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const suffixe = process.pid.toString(36);
const reseau = `ape-vierge-${suffixe}`;
const nom = (n: string) => `ape-vierge-${n}-${suffixe}`;
const temporaire = mkdtempSync(join(tmpdir(), 'ape-vierge-'));
const ORIGIN = 'https://compta.exemple.test';
const DOMAINE = 'compta.exemple.test';
const REGISTRE = 'registre.exemple.test:5000';
const MOT_DE_PASSE = 'mot de passe fictif de la machine vierge';
const conteneurs = new Set<string>();

/** Le DNS du réseau extérieur n'atteint pas les conteneurs de la machine : leurs adresses, à la main. */
function adresse(c: string) {
	return docker(
		'inspect',
		'--format',
		'{{(index .NetworkSettings.Networks "' + reseau + '").IPAddress}}',
		c
	).trim();
}

function docker(...args: string[]) {
	return execFileSync('docker', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 2 ** 28
	});
}

function etape(titre: string) {
	console.log(`\n=== ${titre}`);
}

function lancerService(n: string, alias: string, args: string[]) {
	const c = nom(n);
	docker('run', '--detach', '--name', c, '--network', reseau, '--network-alias', alias, ...args);
	conteneurs.add(c);
	return c;
}

/** Exécute un bloc shell sur la machine, sortie affichée, arrêt à la première erreur. */
function sur(machine: string, script: string) {
	const r = spawnSync('docker', ['exec', '-w', '/root', machine, 'sh', '-euc', script], {
		encoding: 'utf8',
		maxBuffer: 2 ** 28
	});
	if (r.status !== 0) {
		throw new Error(`Échec sur ${machine} :\n${script}\n${r.stdout}\n${r.stderr.slice(-4000)}`);
	}
	return r.stdout.trim();
}

async function attendre(machine: string, script: string, quoi: string, essais = 120) {
	let dernier = '';
	for (let i = 0; i < essais; i++) {
		const r = spawnSync('docker', ['exec', '-w', '/root', machine, 'sh', '-c', script], {
			encoding: 'utf8'
		});
		if (r.status === 0) return;
		dernier = `${r.stdout}${r.stderr}`;
		await new Promise((f) => setTimeout(f, 1000));
	}
	throw new Error(`Jamais vu : ${quoi}\n${dernier.slice(-2000)}`);
}

/** Une machine neuve : Linux, Git, Docker et Compose. Rien d'autre. */
async function machineVierge(n: string) {
	const c = lancerService(n, DOMAINE, [
		'--privileged',
		'--env',
		'DOCKER_TLS_CERTDIR=',
		'--volume',
		`${process.cwd()}:/source:ro`,
		'docker:dind',
		`--insecure-registry=${REGISTRE}`
	]);
	await attendre(c, 'docker info', 'Docker démarré sur la machine');
	sur(c, 'apk add --quiet --no-progress git openssl curl openssh-client');
	sur(c, 'git config --global --add safe.directory "*"');
	return c;
}

/** La seule entorse aux guides : Caddy parle à Pebble plutôt qu'à Let's Encrypt. */
function brancherAcme(machine: string, racineAcme: string) {
	writeFileSync(
		join(temporaire, 'Caddyfile.essai'),
		`{\n\tacme_ca https://pebble:14000/dir\n\tacme_ca_root /etc/caddy/pebble.pem\n}\nimport /etc/caddy/site\n`
	);
	writeFileSync(join(temporaire, 'pebble.pem'), racineAcme);
	docker('cp', join(temporaire, 'Caddyfile.essai'), `${machine}:/root/ape-compta/Caddyfile.essai`);
	docker('cp', join(temporaire, 'pebble.pem'), `${machine}:/root/ape-compta/pebble.pem`);
	sur(
		machine,
		`cd ape-compta && cat > compose.override.yaml <<'F'
services:
  caddy:
    volumes:
      - ./Caddyfile.essai:/etc/caddy/Caddyfile:ro
      - ./Caddyfile:/etc/caddy/site:ro
      - ./pebble.pem:/etc/caddy/pebble.pem:ro
    extra_hosts:
      - pebble:${adresse(nom('pebble'))}
  app:
    extra_hosts:
      - s3.exemple.test:${adresse(nom('s3'))}
F`
	);
}

function remplirEnv(machine: string, reglages: string) {
	sur(
		machine,
		`cd ape-compta
cp .env.example .env
sed -i "s|^ORIGIN=.*|ORIGIN=${ORIGIN}|" .env
sed -i "s|^RESTIC_PASSWORD=.*|RESTIC_PASSWORD=${MOT_DE_PASSE}|" .env
sed -i "/^RESTIC_REPOSITORY=/d" .env
cat >> .env <<'F'
${reglages}
F`
	);
}

const S3 = `RESTIC_REPOSITORY=s3:http://s3.exemple.test:9000/ape
AWS_ACCESS_KEY_ID=identifiant-fictif
AWS_SECRET_ACCESS_KEY=secret-fictif-de-la-machine-vierge`;

async function principal() {
	docker('network', 'create', reseau);

	etape('Services du monde extérieur : ACME, S3, registre');
	const pebbleConfig = {
		pebble: {
			listenAddress: '0.0.0.0:14000',
			managementListenAddress: '0.0.0.0:15000',
			certificate: 'test/certs/localhost/cert.pem',
			privateKey: 'test/certs/localhost/key.pem',
			httpPort: 80,
			tlsPort: 443,
			ocspResponderURL: '',
			externalAccountBindingRequired: false
		}
	};
	writeFileSync(join(temporaire, 'pebble.json'), JSON.stringify(pebbleConfig));
	const pebble = nom('pebble');
	docker(
		'create',
		'--name',
		pebble,
		'--network',
		reseau,
		'--network-alias',
		'pebble',
		'--env',
		'PEBBLE_VA_NOSLEEP=1',
		'--env',
		'PEBBLE_WFE_NONCEREJECT=0',
		'ghcr.io/letsencrypt/pebble:latest',
		'-config',
		'/pebble.json'
	);
	conteneurs.add(pebble);
	docker('cp', join(temporaire, 'pebble.json'), `${pebble}:/pebble.json`);
	docker('start', pebble);
	lancerService('s3', 's3.exemple.test', [
		'rclone/rclone:latest',
		'serve',
		's3',
		'--addr',
		':9000',
		'--auth-key',
		'identifiant-fictif,secret-fictif-de-la-machine-vierge',
		'/tmp'
	]);
	// Le guide le demande : le seau existe avant le premier démarrage.
	docker('exec', nom('s3'), 'mkdir', '/tmp/ape');
	lancerService('registre', 'registre.exemple.test', ['registry:2']);

	etape('Machine A : installation (docs/installation.md)');
	const a = await machineVierge('a');
	sur(a, 'git clone --quiet /source ape-compta');
	remplirEnv(a, S3);
	// Client sur la machine : la chaîne de Pebble tient lieu d'autorité reconnue.
	const racineTls = docker(
		'exec',
		a,
		'sh',
		'-c',
		'curl --silent --insecure https://pebble:15000/roots/0'
	);
	const racineApi = await certificatApiPebble(pebble);
	brancherAcme(a, racineApi);
	sur(a, 'cd ape-compta && docker compose up -d --build 2>&1 | tail -3');
	await attendre(a, 'cd ape-compta && docker compose ps app | grep -q healthy', 'app healthy', 300);
	console.log(
		sur(a, 'cd ape-compta && docker compose ps --format "{{.Service}} {{.State}} {{.Ports}}"')
	);

	etape('HTTPS par ACME et HSTS');
	writeFileSync(join(temporaire, 'racine.pem'), racineTls);
	docker('cp', join(temporaire, 'racine.pem'), `${a}:/root/racine.pem`);
	await attendre(
		a,
		`curl --silent --fail --cacert racine.pem ${ORIGIN}/sante`,
		'certificat ACME',
		120
	);
	console.log(
		sur(a, `curl --silent --head --cacert racine.pem ${ORIGIN}/sante | grep -i strict-transport`)
	);
	console.log(
		sur(
			a,
			`curl --silent --cacert racine.pem -o /dev/null -w '%{http_code}' http://${DOMAINE}/sante`
		)
	);
	console.log(
		sur(
			a,
			`echo | openssl s_client -connect ${DOMAINE}:443 -servername ${DOMAINE} 2>/dev/null | openssl x509 -noout -issuer`
		)
	);

	etape('Premier Accès, par le lien écrit dans les logs');
	const lien = sur(
		a,
		`cd ape-compta && docker compose logs app | grep lien_initial | tail -1 | sed 's/.*"lien":"//; s/".*//'`
	);
	if (!lien.startsWith(`${ORIGIN}/invitation/`)) throw new Error(`Lien inattendu : ${lien}`);
	const accepter = sur(
		a,
		`curl --silent --cacert racine.pem -c session -o /dev/null -w '%{http_code} %{redirect_url}' \
--header 'Origin: ${ORIGIN}' --header 'Accept: text/html' \
--data-urlencode 'identifiant=tresorerie' --data-urlencode 'nomAffiche=Trésorerie fictive' \
--data-urlencode 'motDePasse=${MOT_DE_PASSE}' '${lien}'`
	);
	console.log(accepter);
	if (!accepter.startsWith('303')) throw new Error(`Premier Accès refusé : ${accepter}`);
	console.log(sur(a, 'cd ape-compta && docker compose exec -T app ape verifier'));

	etape('Sauvegarde vers S3');
	await attendre(
		a,
		'cd ape-compta && docker compose exec -T app ape sauvegarder',
		'une sauvegarde réussie après celle du démarrage',
		60
	);
	console.log(
		sur(a, 'cd ape-compta && docker compose exec -T app restic snapshots --compact 2>&1 | tail -3')
	);

	etape('Mise à jour : docker compose pull && docker compose up -d (docs/mise-a-jour.md)');
	sur(
		a,
		`git clone --quiet /source suivante && cd suivante
cat > migrations/0099_essai_montee.sql <<'F'
CREATE TABLE essai_montee (id INTEGER PRIMARY KEY);
F
docker build --quiet --tag ${REGISTRE}/ape-compta:suivante . >/dev/null
docker push --quiet ${REGISTRE}/ape-compta:suivante >/dev/null
docker image rm ${REGISTRE}/ape-compta:suivante >/dev/null`
	);
	sur(a, `cd ape-compta && echo 'APE_IMAGE=${REGISTRE}/ape-compta:suivante' >> .env`);
	sur(
		a,
		'cd ape-compta && docker compose pull 2>&1 | tail -1 && docker compose up -d 2>&1 | tail -1'
	);
	await attendre(
		a,
		'cd ape-compta && docker compose ps app | grep -q healthy',
		'app healthy après mise à jour',
		120
	);
	const compter = `const b=new (require('/app/node_modules/better-sqlite3'))('/data/base.sqlite',{readonly:true});
console.log(b.prepare('SELECT count(*) FROM schema_migrations').pluck().get(), b.prepare('SELECT count(*) FROM acces').pluck().get())`;
	const etat = sur(a, `cd ape-compta && docker compose exec -T app node -e "${compter}"`);
	console.log(`Migrations, Accès : ${etat}`);
	if (etat !== '4 1') throw new Error(`Migration ou données perdues : ${etat}`);
	console.log(sur(a, 'cd ape-compta && docker compose exec -T app ape verifier'));
	const session = sur(
		a,
		`curl --silent --cacert racine.pem -b session -o /dev/null -w '%{http_code}' ${ORIGIN}/bienvenue`
	);
	if (session !== '200') throw new Error(`Session perdue après mise à jour : ${session}`);
	await attendre(
		a,
		'cd ape-compta && docker compose exec -T app ape sauvegarder',
		'une sauvegarde réussie après la mise à jour',
		60
	);

	etape('Machine B : restauration depuis S3 (docs/restauration.md)');
	docker('rm', '--force', '--volumes', a);
	conteneurs.delete(a);
	const b = await machineVierge('b');
	sur(b, 'git clone --quiet /source ape-compta');
	remplirEnv(b, `${S3}\nAPE_IMAGE=${REGISTRE}/ape-compta:suivante`);
	brancherAcme(b, racineApi);
	console.log(sur(b, 'cd ape-compta && docker compose run --rm app ape restaurer 2>&1 | tail -3'));
	sur(b, 'cd ape-compta && docker compose up -d 2>&1 | tail -3');
	await attendre(
		b,
		'cd ape-compta && docker compose ps app | grep -q healthy',
		'app restaurée',
		120
	);
	docker('cp', join(temporaire, 'racine.pem'), `${b}:/root/racine.pem`);
	await attendre(
		b,
		`curl --silent --fail --cacert racine.pem ${ORIGIN}/sante`,
		'HTTPS restauré',
		120
	);
	const connexion = sur(
		b,
		`curl --silent --cacert racine.pem -o /dev/null -w '%{http_code}' \
--header 'Origin: ${ORIGIN}' --header 'Accept: text/html' \
--data-urlencode 'identifiant=tresorerie' --data-urlencode 'motDePasse=${MOT_DE_PASSE}' ${ORIGIN}/connexion`
	);
	console.log(`Connexion après restauration : ${connexion}`);
	if (connexion !== '303') throw new Error(`Connexion refusée : ${connexion}`);

	etape('Dépôt SFTP (docs/installation.md, étape 3)');
	sur(
		b,
		'cd ape-compta && mkdir cle-sftp && ssh-keygen -q -t ed25519 -N "" -f cle-sftp/id_ed25519'
	);
	const publique = sur(b, 'cat ape-compta/cle-sftp/id_ed25519.pub');
	const sftp = lancerService('sftp', 'sftp.exemple.test', [
		'--env',
		'USER_NAME=ape',
		'--env',
		`PUBLIC_KEY=${publique}`,
		'--env',
		'PUID=1000',
		'--env',
		'PGID=1000',
		'linuxserver/openssh-server:latest'
	]);
	await attendre(
		sftp,
		'test -d /config/.ssh && ss -ltn 2>/dev/null | grep -q 2222 || nc -z 127.0.0.1 2222',
		'sftp prêt',
		60
	);
	docker('exec', sftp, 'sh', '-c', 'mkdir -p /config/depot && chown 1000:1000 /config/depot');
	sur(
		b,
		`cd ape-compta
sed -i "/^RESTIC_REPOSITORY=/d" .env
echo 'RESTIC_REPOSITORY=sftp://ape@sftp.exemple.test:2222//config/depot' >> .env
ssh-keyscan -p 2222 sftp.exemple.test 2>/dev/null > cle-sftp/known_hosts
chown -R 1000:1000 cle-sftp
cat >> compose.override.yaml <<'F'
    volumes:
      - ./cle-sftp:/home/node/.ssh:ro
F
sed -i 's|      - s3.exemple.test:.*|&\\n      - sftp.exemple.test:${adresse(sftp)}|' compose.override.yaml
docker compose up -d 2>&1 | tail -2`
	);
	await attendre(
		b,
		'cd ape-compta && docker compose ps app | grep -q healthy',
		'app après SFTP',
		120
	);
	await attendre(
		b,
		'cd ape-compta && docker compose exec -T app ape sauvegarder',
		'une sauvegarde réussie vers SFTP',
		60
	);
	console.log(
		sur(b, 'cd ape-compta && docker compose exec -T app restic snapshots --compact 2>&1 | tail -4')
	);
	console.log('\nGuides déroulés de bout en bout.');
}

/** La racine qui signe l'adresse ACME de Pebble, lue dans l'image : Caddy doit s'y fier. */
async function certificatApiPebble(pebble: string) {
	const copie = join(temporaire, 'minica.pem');
	docker('cp', `${pebble}:/test/certs/pebble.minica.pem`, copie);
	return (await import('node:fs')).readFileSync(copie, 'utf8');
}

function nettoyer() {
	for (const c of conteneurs) spawnSync('docker', ['rm', '--force', '--volumes', c]);
	spawnSync('docker', ['network', 'rm', reseau]);
	rmSync(temporaire, { recursive: true, force: true });
}

let reussi = false;
try {
	await principal();
	reussi = true;
} catch (e) {
	console.error(`\nÉchec : ${e instanceof Error ? e.message : String(e)}`);
	process.exitCode = 1;
} finally {
	if (reussi || !process.env.GARDER) nettoyer();
}
