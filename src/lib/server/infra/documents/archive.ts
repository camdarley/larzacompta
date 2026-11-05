/** Export complet : ZIP lisible sans l'outil (AD-18). Pièces déjà compressées : stockées telles quelles. */
import { strToU8, zipSync, type Zippable } from 'fflate';

export function genererZip(fichiers: Readonly<Record<string, Uint8Array | string>>): Uint8Array {
	const contenu: Zippable = {};
	for (const [nom, octets] of Object.entries(fichiers)) {
		contenu[nom] = typeof octets === 'string' ? strToU8(octets) : [octets, { level: 0 }];
	}
	return zipSync(contenu);
}
