/** Seul fichier qui parle à restic. Le mot de passe ne sort jamais de l'environnement du process. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { copieHorsVps, extraitSur } from '#lib/domaine/exploitation.ts';

export type Environnement = Record<string, string | undefined>;

export type Restic = {
	horsVps: boolean;
	lancer(args: string[]): Promise<string>;
	assurerDepot(): Promise<void>;
};

/** Code de sortie de restic : le dépôt n'existe pas encore. */
const DEPOT_ABSENT = 10;

class EchecRestic extends Error {
	code: number | null;

	constructor(message: string, code: number | null) {
		super(message);
		this.code = code;
	}
}

export function creerRestic(dossier: string, env: Environnement, executable = 'restic'): Restic {
	const distant = env.RESTIC_REPOSITORY?.trim() ?? '';
	const depot = distant === '' ? join(dossier, 'sauvegardes', 'depot') : distant;
	const secrets = [env.RESTIC_PASSWORD ?? ''];

	const lancer = (args: string[]) =>
		new Promise<string>((resolve, reject) => {
			if (!env.RESTIC_PASSWORD && !env.RESTIC_PASSWORD_FILE) {
				reject(new EchecRestic('RESTIC_PASSWORD manque dans .env.', null));
				return;
			}
			const process_ = spawn(executable, args, {
				env: { ...env, RESTIC_REPOSITORY: depot },
				stdio: ['ignore', 'pipe', 'pipe']
			});
			let sortie = '';
			let erreurs = '';
			process_.stdout.on('data', (d) => (sortie += d));
			process_.stderr.on('data', (d) => (erreurs += d));
			process_.on('error', (e) =>
				reject(new EchecRestic(extraitSur(`restic introuvable : ${e.message}`, secrets), null))
			);
			process_.on('close', (code) => {
				if (code === 0) resolve(sortie);
				else {
					const detail = extraitSur(erreurs || `restic a rendu le code ${code}.`, secrets);
					reject(new EchecRestic(detail, code));
				}
			});
		});

	return {
		horsVps: copieHorsVps(distant),
		lancer,
		async assurerDepot() {
			try {
				await lancer(['cat', 'config', '--quiet']);
			} catch (e) {
				if (!(e instanceof EchecRestic) || e.code !== DEPOT_ABSENT) throw e;
				await lancer(['init', '--quiet']);
			}
		}
	};
}
