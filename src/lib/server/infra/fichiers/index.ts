/**
 * Stockage adressé par contenu (AD-16) : `<dossier>/<sha256[0:2]>/<sha256>`.
 * Le fichier est écrit puis renommé : il existe toujours avant sa référence en base.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fichiers } from '../../application/ports.ts';

export function creerFichiers(dossier: string): Fichiers {
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
			// Le SHA vient de la base, mais rien d'autre qu'une empreinte ne devient un chemin.
			if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
			const cible = join(dossier, sha256.slice(0, 2), sha256);
			return existsSync(cible) ? new Uint8Array(readFileSync(cible)) : null;
		}
	};
}
