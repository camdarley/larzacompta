import { argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Hacheur } from '../../application/ports.ts';

/** Argon2id, 19 Mio, 2 passes, au format PHC (AD-14). */
const MEMOIRE_KIO = 19 * 1024;
const PASSES = 2;
const PARALLELISME = 1;
const LONGUEUR = 32;

function deriver(motDePasse: string, sel: Buffer, memoire: number, passes: number, p: number) {
	return argon2Sync('argon2id', {
		message: Buffer.from(motDePasse, 'utf8'),
		nonce: sel,
		parallelism: p,
		tagLength: LONGUEUR,
		memory: memoire,
		passes
	});
}

export function creerHacheur(): Hacheur {
	return {
		hacher(motDePasse) {
			const sel = randomBytes(16);
			const hash = deriver(motDePasse, sel, MEMOIRE_KIO, PASSES, PARALLELISME);
			const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
			return `$argon2id$v=19$m=${MEMOIRE_KIO},t=${PASSES},p=${PARALLELISME}$${b64(sel)}$${b64(hash)}`;
		},
		verifier(motDePasse, phc) {
			const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(phc);
			if (!m) return false;
			const attendu = Buffer.from(m[5] as string, 'base64');
			const calcule = deriver(
				motDePasse,
				Buffer.from(m[4] as string, 'base64'),
				Number(m[1]),
				Number(m[2]),
				Number(m[3])
			);
			return attendu.length === calcule.length && timingSafeEqual(attendu, calcule);
		}
	};
}
