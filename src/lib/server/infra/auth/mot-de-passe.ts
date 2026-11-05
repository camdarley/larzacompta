import { argon2, argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Hacheur } from '../../application/ports.ts';

/** Argon2id, 19 Mio, 2 passes, au format PHC (AD-14). */
const MEMOIRE_KIO = 19 * 1024;
const PASSES = 2;
const PARALLELISME = 1;
const LONGUEUR = 32;

const parametres = (
	motDePasse: string,
	sel: Buffer,
	memoire: number,
	passes: number,
	p: number
) => ({
	message: Buffer.from(motDePasse, 'utf8'),
	nonce: sel,
	parallelism: p,
	tagLength: LONGUEUR,
	memory: memoire,
	passes
});

/** Hors du fil principal : quelques dizaines de millisecondes par essai ne figent pas le serveur. */
function deriver(motDePasse: string, sel: Buffer, memoire: number, passes: number, p: number) {
	return new Promise<Buffer>((resoudre, rejeter) => {
		argon2('argon2id', parametres(motDePasse, sel, memoire, passes, p), (erreur, hash) => {
			if (erreur) rejeter(erreur);
			else resoudre(hash);
		});
	});
}

const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
const phc = (sel: Buffer, hash: Buffer) =>
	`$argon2id$v=19$m=${MEMOIRE_KIO},t=${PASSES},p=${PARALLELISME}$${b64(sel)}$${b64(hash)}`;

/** Jeux de démonstration et scripts seulement : le serveur passe par `creerHacheur`. */
export function hacherSansAttendre(motDePasse: string): string {
	const sel = randomBytes(16);
	const p = parametres(motDePasse, sel, MEMOIRE_KIO, PASSES, PARALLELISME);
	return phc(sel, argon2Sync('argon2id', p));
}

export function creerHacheur(): Hacheur {
	return {
		async hacher(motDePasse) {
			const sel = randomBytes(16);
			return phc(sel, await deriver(motDePasse, sel, MEMOIRE_KIO, PASSES, PARALLELISME));
		},
		async verifier(motDePasse, empreinte) {
			const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(empreinte);
			if (!m) return false;
			const attendu = Buffer.from(m[5] as string, 'base64');
			const calcule = await deriver(
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
