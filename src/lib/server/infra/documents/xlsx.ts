/**
 * Export XLSX d'un état (AD-18). Une cellule de montant est un nombre en euros, au format
 * monétaire : le passage en euros sert seulement à cet affichage, aucun calcul ne s'en sert.
 */
import writeXlsxFile, { type Row } from 'write-excel-file/node';
import type { Cellule, ModeleDocument } from '#lib/domaine/etats/documents.ts';

const FORMAT_MONTANT = '#,##0.00\\ "€"';
const FORMAT_SIGNE = '+#,##0.00\\ "€";−#,##0.00\\ "€";0.00\\ "€"';
const LARGEUR_LIBELLE = 44;
const LARGEUR_MONTANT = 16;

type Rangee = Row;

function cellule(c: Cellule, fort: boolean, niveau: number): Row[number] {
	const graisse = fort ? { fontWeight: 'bold' as const } : {};
	if (c === null) return { value: undefined, ...graisse };
	if (typeof c === 'string') {
		return { value: c, type: String, ...graisse, ...(niveau > 0 ? { indent: niveau } : {}) };
	}
	return {
		value: c.montant / 100,
		type: Number,
		format: c.signe ? FORMAT_SIGNE : FORMAT_MONTANT,
		...graisse
	};
}

export async function genererXlsx(m: ModeleDocument): Promise<Uint8Array> {
	const rangees: Rangee[] = [
		[{ value: m.titre, type: String, fontWeight: 'bold' }],
		[{ value: `${m.association}, Exercice ${m.exercice}`, type: String }],
		[{ value: undefined }]
	];
	let colonnes = 1;
	for (const s of m.sections) {
		if (m.sections.length > 1) rangees.push([{ value: s.titre, type: String, fontWeight: 'bold' }]);
		if (s.tableau === null) {
			for (const p of s.phrases) rangees.push([{ value: p, type: String }]);
			rangees.push([{ value: undefined }]);
			continue;
		}
		colonnes = Math.max(colonnes, s.tableau.colonnes.length);
		rangees.push(
			s.tableau.colonnes.map((c) => ({
				value: c.libelle,
				type: String,
				fontWeight: 'bold' as const,
				...(c.montant ? { align: 'right' as const } : {})
			}))
		);
		for (const r of s.tableau.rangees) {
			rangees.push(r.cellules.map((c) => cellule(c, r.fort ?? false, r.niveau)));
		}
		rangees.push([{ value: undefined }]);
	}
	const octets = await writeXlsxFile(rangees, {
		columns: Array.from({ length: colonnes }, (_, i) => ({
			width: i === 0 ? LARGEUR_LIBELLE : LARGEUR_MONTANT
		})),
		sheet: m.titre.slice(0, 31)
	}).toBuffer();
	return new Uint8Array(octets);
}
