/**
 * Export complet : ZIP lisible sans l'outil (AD-18), produit en flux, une Pièce à la fois.
 * Les Pièces, déjà compressées, sont stockées telles quelles.
 */
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { EntreeArchive } from '../../application/ports.ts';

export function genererZip(entrees: Iterable<EntreeArchive>): ReadableStream<Uint8Array> {
	const suite = entrees[Symbol.iterator]();
	let zip: Zip;
	return new ReadableStream<Uint8Array>({
		start(sortie) {
			zip = new Zip((erreur, morceau, fin) => {
				if (erreur) {
					sortie.error(erreur);
					return;
				}
				sortie.enqueue(morceau);
				if (fin) sortie.close();
			});
		},
		pull() {
			// Une entrée vide n'écrit rien : on passe à la suivante, sinon le flux n'avance plus.
			for (;;) {
				const { done, value } = suite.next();
				if (done) {
					zip.end();
					return;
				}
				const contenu = value.lire();
				if (contenu === null) continue;
				const fichier =
					typeof contenu === 'string'
						? new ZipDeflate(value.nom, { level: 6 })
						: new ZipPassThrough(value.nom);
				zip.add(fichier);
				fichier.push(typeof contenu === 'string' ? strToU8(contenu) : contenu, true);
				return;
			}
		}
	});
}
