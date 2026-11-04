import { describe, expect, it } from 'vitest';
import { ecartsFrontieres, importsDe } from './frontieres.ts';
import { sources } from './fichiers.ts';

describe('frontières de couches (AD-1)', () => {
	it('le code réel les respecte', () => {
		const ecarts = ecartsFrontieres(sources('src'));
		expect(ecarts.map((e) => `${e.chemin} ${e.raison}`)).toEqual([]);
	});

	it.each([
		['import { readFileSync } from "node:fs";', 'importe node:fs'],
		['import z from "zod";', 'importe zod'],
		['export const t = Date.now();', 'appelle Date.now()'],
		['export const a = Math.random();', 'appelle Math.random()'],
		['export const d = new Date();', "lit l'horloge avec new Date()"]
	])('nomme le fichier fautif du domaine pour %s', (contenu, raison) => {
		const chemin = 'src/lib/domaine/fautif.ts';
		expect(ecartsFrontieres([{ chemin, contenu }])).toContainEqual({ chemin, raison });
	});

	it("refuse qu'une route importe l'infrastructure", () => {
		const chemin = 'src/routes/x/+page.server.ts';
		const contenu = "import { ouvrir } from '#lib/server/infra/sqlite/connexion.ts';";
		const ecarts = ecartsFrontieres([{ chemin, contenu }]);
		expect(ecarts[0]?.chemin).toBe(chemin);
		expect(ecarts[0]?.raison).toContain('infrastructure');
	});

	it("refuse que l'application dépende d'un adaptateur", () => {
		const chemin = 'src/lib/server/application/x.ts';
		const contenu = "import fs from 'node:fs';";
		expect(ecartsFrontieres([{ chemin, contenu }])[0]?.raison).toContain('adaptateur');
	});

	it('accepte les imports du domaine vers lui-même', () => {
		const contenu = "import { ok } from '#lib/domaine/resultat.ts';\nimport b from './b.ts';";
		expect(ecartsFrontieres([{ chemin: 'src/lib/domaine/a.ts', contenu }])).toEqual([]);
	});

	it('lit les imports dynamiques et les réexports', () => {
		expect(importsDe("const x = import('node:fs'); export { a } from 'zod';")).toEqual([
			'node:fs',
			'zod'
		]);
	});
});
