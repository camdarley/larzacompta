/**
 * Stockage adressé par contenu (AD-16) : `<dossier>/<sha256[0:2]>/<sha256>`.
 * Le fichier est écrit puis renommé : il existe toujours avant sa référence en base.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Fichiers } from '../../application/ports.ts';

const EMPREINTE = /^[0-9a-f]{64}$/;

export function creerFichiers(dossier: string): Fichiers {
	// Le SHA vient de la base, mais rien d'autre qu'une empreinte ne devient un chemin.
	const chemin = (sha256: string) =>
		EMPREINTE.test(sha256) ? join(dossier, sha256.slice(0, 2), sha256) : null;

	return {
		ecrire(octets) {
			const sha256 = createHash('sha256').update(octets).digest('hex');
			const sousDossier = join(dossier, sha256.slice(0, 2));
			const cible = join(sousDossier, sha256);
			if (existsSync(cible)) return sha256;

			mkdirSync(sousDossier, { recursive: true });
			const temporaire = join(sousDossier, `.${randomUUID()}.tmp`);
			try {
				writeFileSync(temporaire, octets, { flag: 'wx' });
				renameSync(temporaire, cible);
			} catch (e) {
				rmSync(temporaire, { force: true });
				throw e;
			}
			return sha256;
		},

		lire(sha256) {
			const cible = chemin(sha256);
			return cible !== null && existsSync(cible) ? new Uint8Array(readFileSync(cible)) : null;
		},

		existe(sha256) {
			const cible = chemin(sha256);
			return cible !== null && existsSync(cible);
		},

		lister() {
			if (!existsSync(dossier)) return [];
			return readdirSync(dossier).flatMap((sous) => {
				if (!/^[0-9a-f]{2}$/.test(sous)) return [];
				return readdirSync(join(dossier, sous))
					.filter((nom) => EMPREINTE.test(nom))
					.map((sha256) => ({
						sha256,
						modifieLe: statSync(join(dossier, sous, sha256)).mtime.toISOString()
					}));
			});
		},

		supprimer(sha256) {
			const cible = chemin(sha256);
			if (cible !== null) rmSync(cible, { force: true });
		}
	};
}
