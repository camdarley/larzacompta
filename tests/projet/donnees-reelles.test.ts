import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sources } from './fichiers.ts';

/**
 * Empreintes SHA-256 de mots propres aux données d'origine : le dépôt étant public,
 * ce test ne doit pas lui-même contenir ces mots (AD-24).
 */
const INTERDITS = new Set([
	'519f37f71271cf814937044fd8b8f9647327ad3adbf10f27fd16c6dc58319b68',
	'8981831ccc53adf7eba6107b28539b8ac23719f75166aaff35ddd4a36814dfa1',
	'0bb00f12b8f2c8fd99dfad79beaec7fdda77f522b12ab9de6d4552c5ad9c8c6d'
]);

const empreinte = (mot: string) => createHash('sha256').update(mot).digest('hex');

const IBAN = /\bFR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{3}\b/;

describe('aucune donnée réelle dans le dépôt', () => {
	const fichiers = [
		...sources('src', ['.ts', '.svelte', '.json']),
		...sources('tests', ['.ts']),
		...sources('migrations', ['.sql'])
	];

	it('aucun mot interdit', () => {
		const fautifs = fichiers.flatMap(({ chemin, contenu }) =>
			[...new Set(contenu.toLowerCase().match(/\p{L}{4,}/gu) ?? [])]
				.filter((m) => INTERDITS.has(empreinte(m)))
				.map(() => chemin)
		);
		expect(fautifs).toEqual([]);
	});

	it('aucun IBAN', () => {
		expect(fichiers.filter((f) => IBAN.test(f.contenu)).map((f) => f.chemin)).toEqual([]);
	});

	it('détecte bien un mot interdit', () => {
		expect(INTERDITS.has(empreinte('kermesse'))).toBe(false);
		expect(INTERDITS.size).toBeGreaterThan(0);
		expect(IBAN.test(['FR76', '3000 6000', '0000 0000 0000', '000'].join(' '))).toBe(true);
	});
});
