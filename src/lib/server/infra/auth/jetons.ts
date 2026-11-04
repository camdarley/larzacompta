import { createHash, randomBytes } from 'node:crypto';
import type { Jetons } from '../../application/ports.ts';

export function creerJetons(): Jetons {
	return {
		generer: () => randomBytes(32).toString('base64url'),
		empreinte: (jeton) => createHash('sha256').update(jeton).digest('hex')
	};
}
