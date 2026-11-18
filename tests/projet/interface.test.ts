import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { genererCss, type Jetons } from '../../scripts/generer-jetons.ts';
import { NOM_PRODUIT } from '#lib/produit.ts';
import paires from '#lib/ui/contrastes.source.json' with { type: 'json' };
import jetons from '#lib/ui/jetons.source.json' with { type: 'json' };
import { parcourir, relatif, sources } from './fichiers.ts';

function luminance(hex: string) {
	const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const [r, g, b] = canaux.map((c) =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
	const [claire, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (claire + 0.05) / (sombre + 0.05);
}

const couleurs = jetons.colors as Record<string, string>;

describe('jetons', () => {
	it('jetons.css est à jour avec sa source', () => {
		expect(readFileSync('src/lib/ui/jetons.css', 'utf8')).toBe(genererCss(jetons as Jetons));
	});

	it('contient les variables des deux thèmes', () => {
		const css = readFileSync('src/lib/ui/jetons.css', 'utf8');
		expect(css).toContain('--surface-base: #FBF8F3;');
		expect(css).toContain('--surface-base: #17151D;');
		expect(css).toContain("[data-theme='sombre']");
		expect(css).toContain('prefers-color-scheme: dark');
	});

	it("aucun composant n'écrit une couleur littérale", () => {
		const fautifs: string[] = [];
		const fichiers = parcourir('src', ['.svelte', '.css']).filter((f) => !f.endsWith('jetons.css'));
		for (const f of fichiers) {
			const contenu = readFileSync(f, 'utf8');
			const style = f.endsWith('.css')
				? contenu
				: (contenu.match(/<style[\s\S]*?<\/style>/g) ?? []).join('');
			const litterale =
				/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|lab)\(|:\s*(?:white|black|red|green|blue)\b/.test(
					style
				) || /style="[^"]*(?:#[0-9a-fA-F]{3,8}|rgb\()/.test(contenu);
			if (litterale) fautifs.push(relatif(f));
		}
		expect(fautifs).toEqual([]);
	});
});

describe('contrastes vérifiés (DESIGN.md)', () => {
	it('couvre les 29 paires', () => {
		expect(paires).toHaveLength(29);
	});

	it.each(paires)('$texte sur $fond', ({ texte, fond, clair, sombre }) => {
		const seuil = texte === 'border-strong' ? 3 : 4.5;
		const rClair = ratio(couleurs[texte] as string, couleurs[fond] as string);
		const rSombre = ratio(couleurs[`${texte}-dark`] as string, couleurs[`${fond}-dark`] as string);
		expect(rClair).toBeGreaterThanOrEqual(seuil);
		expect(rSombre).toBeGreaterThanOrEqual(seuil);
		expect(Math.abs(rClair - clair)).toBeLessThan(0.02);
		expect(Math.abs(rSombre - sombre)).toBeLessThan(0.02);
	});
});

describe('nom du produit', () => {
	it("n'apparaît que dans #lib/produit", () => {
		const fautifs = sources('src', ['.ts', '.svelte', '.css', '.html'])
			.filter((f) => f.contenu.includes(NOM_PRODUIT) && f.chemin !== 'src/lib/produit.ts')
			.map((f) => f.chemin);
		expect(fautifs).toEqual([]);
	});
});

describe('vocabulaire', () => {
	it('parle d’« association », jamais d’« APE », hors du nom du produit', () => {
		const fautifs = sources('src', ['.ts', '.svelte', '.css', '.html']).flatMap((f) =>
			f.contenu
				.replaceAll(NOM_PRODUIT, '')
				.split('\n')
				.map((ligne, i) => (/\bAPE\b/.test(ligne) ? `${f.chemin}:${i + 1}` : null))
				.filter((x) => x !== null)
		);
		expect(fautifs).toEqual([]);
	});
});
