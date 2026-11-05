/** Un serveur construit à part, sur son port et son dossier, pour les jeux qui le demandent. */
import { spawn } from 'node:child_process';

export const envServeur = (dossier: string, port: number) => ({
	...process.env,
	APE_DONNEES: dossier,
	ORIGIN: `http://localhost:${port}`,
	PROTOCOL_HEADER: 'x-forwarded-proto',
	BODY_SIZE_LIMIT: '25M',
	PORT: String(port),
	HOST: '127.0.0.1',
	TZ: 'Europe/Paris'
});

export async function demarrerServeur(dossier: string, port: number) {
	const serveur = spawn('node', ['build/index.js'], {
		stdio: 'ignore',
		env: envServeur(dossier, port)
	});
	for (let i = 0; i < 100; i++) {
		if ((await fetch(`http://localhost:${port}/sante`).catch(() => null))?.ok) return serveur;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('Le serveur ne répond pas.');
}
