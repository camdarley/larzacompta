import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parcourir } from './fichiers.ts';

/** Invariants du §6 livrés. Q et F3 à F5 viennent avec leurs fonctions. */
const LIVRES = [
	...Array.from({ length: 11 }, (_, i) => `O${i + 1}`),
	...Array.from({ length: 6 }, (_, i) => `P${i + 1}`),
	...Array.from({ length: 7 }, (_, i) => `E${i + 1}`),
	...Array.from({ length: 12 }, (_, i) => `C${i + 1}`),
	'F1',
	'F2',
	'F6',
	'F7',
	'A1',
	'A2',
	'A3'
];

describe('invariants du schéma (AD-23)', () => {
	it('chacun a un test d’application portant son numéro', () => {
		const noms = parcourir('tests/application', ['.test.ts'])
			.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\b(?:it|describe)\(\s*['"`](.*)/g)])
			.map((m) => m[1])
			.join('\n');
		const absents = LIVRES.filter((n) => !new RegExp(`\\b${n}\\b`).test(noms));
		expect(absents).toEqual([]);
	});
});
