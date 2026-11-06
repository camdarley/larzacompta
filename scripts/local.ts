/**
 * Lance l'outil sur ce poste, sans Caddy ni Docker : `pnpm local`.
 *
 * adapter-node suppose une origine en https, sauf si `PROTOCOL_HEADER` lui dit le contraire, et un
 * navigateur n'envoie pas cet en-tête. Sans proxy, Kit refuse donc chaque formulaire. Ce relais tient
 * le rôle de Caddy : il écoute sur `localhost`, seul nom pour lequel Kit assouplit le cookie `secure`,
 * et il n'est joignable que depuis ce poste.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 4173);
const PORT_INTERNE = PORT + 10000;
const ORIGINE = `http://localhost:${PORT}`;
const DONNEES = resolve(process.env.APE_DONNEES ?? 'data');

if (!existsSync('build/index.js')) {
	console.error('Rien à lancer : faites d’abord pnpm build.');
	process.exit(1);
}

const serveur = spawn('node', ['build/index.js'], {
	stdio: ['ignore', 'pipe', 'inherit'],
	env: {
		...process.env,
		APE_DONNEES: DONNEES,
		ORIGIN: ORIGINE,
		PROTOCOL_HEADER: 'x-forwarded-proto',
		BODY_SIZE_LIMIT: process.env.BODY_SIZE_LIMIT ?? '25M',
		HOST: '127.0.0.1',
		PORT: String(PORT_INTERNE)
	}
});

serveur.stdout.setEncoding('utf8').on('data', (texte: string) => {
	process.stdout.write(texte);
	const lien = /"lien":"([^"]+)"/.exec(texte)?.[1];
	if (lien) console.log(`\nOuvrez ce lien pour créer votre Accès :\n${lien}\n`);
});
serveur.on('exit', (code) => process.exit(code ?? 1));

const relais = createServer((entree, sortie) => {
	// Un marque-page en 127.0.0.1 perdrait sa session : le cookie ne vaut que pour localhost.
	if (!entree.headers.host?.startsWith('localhost')) {
		sortie.writeHead(307, { location: `${ORIGINE}${entree.url}` }).end();
		return;
	}
	const vers = request(
		{
			host: '127.0.0.1',
			port: PORT_INTERNE,
			method: entree.method,
			path: entree.url,
			headers: { ...entree.headers, 'x-forwarded-proto': 'http' }
		},
		(reponse) => {
			sortie.writeHead(reponse.statusCode ?? 502, reponse.headers);
			reponse.pipe(sortie);
		}
	);
	vers.on('error', () => {
		if (!sortie.headersSent) sortie.writeHead(502);
		sortie.end('Le serveur démarre encore : rechargez dans un instant.');
	});
	entree.pipe(vers);
});

// Sur les deux boucles locales, car `localhost` vise l'une ou l'autre selon le navigateur.
relais.listen(PORT, '127.0.0.1', () => {
	console.log(`Outil disponible sur ${ORIGINE}, données dans ${DONNEES}. Ctrl+C pour arrêter.`);
});
const relaisV6 = createServer((e, s) => relais.emit('request', e, s));
relaisV6.on('error', () => {}); // Poste sans IPv6 : la boucle IPv4 suffit.
relaisV6.listen(PORT, '::1');

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => serveur.kill(signal));
