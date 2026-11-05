/** CSV lisible par Excel français : UTF-8 avec BOM, `;`, CRLF (AD-18). */
const BOM = '﻿';

function cellule(valeur: string): string {
	// Un libellé qui commence par `=` ne doit pas s'exécuter comme une formule à l'ouverture.
	// Les montants exportés (`-12,50`) restent des nombres.
	const sur = /^[=+@\t\r]|^-(?!\d)/.test(valeur) ? `'${valeur}` : valeur;
	return /[;"\r\n]/.test(sur) ? `"${sur.replaceAll('"', '""')}"` : sur;
}

export function genererCsv(
	entetes: readonly string[],
	lignes: readonly (readonly string[])[]
): string {
	const rangees = [entetes, ...lignes].map((l) => l.map(cellule).join(';'));
	return `${BOM}${rangees.join('\r\n')}\r\n`;
}
