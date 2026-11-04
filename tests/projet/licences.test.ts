import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RACINE } from './fichiers.ts';
import { licenceCompatible } from './licences.ts';

type Paquet = { name: string; version: string; license?: string; dependencies?: object };

/** Paquets sans champ `license`, dont le fichier LICENSE a été lu à la main. */
const LICENCES_VERIFIEES: Record<string, string> = {
	'svelte-toolbelt': 'MIT'
};

/** Dossier réel d'un paquet : pnpm range les dépendances d'un paquet à côté de lui. */
function dossierDe(nom: string, depuis: string): string | null {
	const chemin = join(depuis, 'node_modules', nom, 'package.json');
	return existsSync(chemin) ? dirname(realpathSync(chemin)) : null;
}

function voisin(nom: string, dossier: string): string | null {
	const profondeur = nom.split('/').length;
	let racine = dossier;
	for (let i = 0; i < profondeur; i++) racine = dirname(racine);
	const chemin = join(racine, nom, 'package.json');
	return existsSync(chemin) ? dirname(realpathSync(chemin)) : null;
}

function dependancesDeProduction(): Paquet[] {
	const racine = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')) as Paquet;
	const vus = new Map<string, Paquet>();
	const file: string[] = [];
	for (const nom of Object.keys(racine.dependencies ?? {})) {
		const d = dossierDe(nom, RACINE);
		if (d) file.push(d);
		else throw new Error(`Dépendance introuvable : ${nom}`);
	}
	while (file.length > 0) {
		const dossier = file.pop() as string;
		const p = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8')) as Paquet;
		const cle = `${p.name}@${p.version}`;
		if (vus.has(cle)) continue;
		vus.set(cle, p);
		for (const nom of Object.keys(p.dependencies ?? {})) {
			const d = voisin(nom, dossier);
			if (d) file.push(d);
		}
	}
	return [...vus.values()];
}

describe('licences des dépendances de production (AD-24)', () => {
	it('sont toutes compatibles avec AGPL-3.0', () => {
		const paquets = dependancesDeProduction();
		expect(paquets.length).toBeGreaterThan(10);
		const refus = paquets
			.filter((p) => !licenceCompatible(p.license ?? LICENCES_VERIFIEES[p.name]))
			.map((p) => `${p.name}@${p.version} : ${p.license ?? 'licence absente'}`);
		expect(refus).toEqual([]);
	});

	it('refuse une licence incompatible', () => {
		expect(licenceCompatible('CC-BY-NC-4.0')).toBe(false);
		expect(licenceCompatible('UNLICENSED')).toBe(false);
		expect(licenceCompatible(undefined)).toBe(false);
	});

	it('lit une expression SPDX', () => {
		expect(licenceCompatible('(MIT OR GPL-3.0-only)')).toBe(true);
		expect(licenceCompatible('MIT AND CC-BY-NC-4.0')).toBe(false);
		expect(licenceCompatible('Apache-2.0 OR SSPL-1.0')).toBe(true);
	});
});
