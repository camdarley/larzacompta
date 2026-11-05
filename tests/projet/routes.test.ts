import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deciderRoute } from '#lib/domaine/droits.ts';
import { navigation } from '#lib/fonctions.ts';
import { ROUTES } from '#lib/routes.ts';
import { parcourir, relatif } from './fichiers.ts';

function routesDuCode() {
	return parcourir('src/routes', ['+page.svelte', '+server.ts']).map((f) => {
		const chemin = dirname(relatif(f)).replace(/^src\/routes/, '');
		return chemin === '' ? '/' : chemin;
	});
}

describe('table routes vers droit', () => {
	it('couvre chaque route du code', () => {
		const absentes = routesDuCode().filter((r) => !(r in ROUTES));
		expect(absentes).toEqual([]);
	});

	it('ne cite aucune route disparue', () => {
		const code = new Set(routesDuCode());
		expect(Object.keys(ROUTES).filter((r) => !code.has(r))).toEqual([]);
	});

	it('chaque entrée de navigation livrée mène à une route', () => {
		const n = navigation('tresorier');
		const hrefs = [...n.groupes.flatMap((g) => g.entrees), ...n.bas].map((e) => e.href);
		for (const href of hrefs) {
			const route = href === '/' ? '' : href;
			expect(existsSync(`src/routes/(app)${route}/+page.svelte`), href).toBe(true);
		}
	});

	it('toute page de (app) passe par un droit, jamais « publique »', () => {
		const publiques = Object.entries(ROUTES).filter(
			([r, d]) => r.startsWith('/(app)') && d === 'publique'
		);
		expect(publiques).toEqual([]);
	});

	it('A3 : un·e compteur·se n’ouvre que ses écrans de Comptage, toute autre route lui est refusée', () => {
		const ouvertes = Object.entries(ROUTES)
			.filter(([, regle]) => regle !== 'publique' && deciderRoute(regle, 'compteur') === 'ouvrir')
			.map(([route]) => route)
			.sort();
		expect(ouvertes).toEqual([
			'/(app)/aide',
			'/(app)/plus',
			'/(app)/preferences',
			'/(compteur)/caisses/[id]/comptage',
			'/(compteur)/mes-caisses',
			'/(compteur)/sessions/[id]/comptage',
			'/api/caisses/[id]/comptage',
			'/api/sessions/[id]/comptage',
			'/code-source'
		]);
	});

	it('hooks.server.ts refuse une route absente', () => {
		const hooks = readFileSync('src/hooks.server.ts', 'utf8');
		expect(hooks).toContain("case 'inconnue'");
	});
});
