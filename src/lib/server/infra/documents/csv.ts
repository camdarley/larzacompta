/** CSV lisible par Excel français : UTF-8 avec BOM, `;`, CRLF (AD-18). */
const BOM = '﻿';

function cellule(valeur: string): string {
	// Un libellé qui commence par `=` ne doit pas s'exécuter comme une formule à l'ouverture.
	// Seul un vrai nombre (`-12,50`, `-1 234,50`) échappe au préfixe, jamais `-1+cmd|...`.
	const nombre = /^-\d[\d\s]*(,\d+)?$/.test(valeur);
	const sur = /^[=+@\-\t\r]/.test(valeur) && !nombre ? `'${valeur}` : valeur;
	return /[;"\r\n]/.test(sur) ? `"${sur.replaceAll('"', '""')}"` : sur;
}

export function genererCsv(
	entetes: readonly string[],
	lignes: readonly (readonly string[])[]
): string {
	const rangees = [entetes, ...lignes].map((l) => l.map(cellule).join(';'));
	return `${BOM}${rangees.join('\r\n')}\r\n`;
}
