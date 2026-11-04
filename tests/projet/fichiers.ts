import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const RACINE = process.cwd();

export function parcourir(dossier: string, extensions: string[]): string[] {
	const resultats: string[] = [];
	const visiter = (d: string) => {
		for (const nom of readdirSync(d)) {
			const complet = join(d, nom);
			if (statSync(complet).isDirectory()) visiter(complet);
			else if (extensions.some((e) => nom.endsWith(e))) resultats.push(complet);
		}
	};
	visiter(join(RACINE, dossier));
	return resultats;
}

export function relatif(complet: string) {
	return relative(RACINE, complet).split(sep).join('/');
}

export function sources(dossier: string, extensions = ['.ts', '.svelte']) {
	return parcourir(dossier, extensions).map((f) => ({
		chemin: relatif(f),
		contenu: readFileSync(f, 'utf8')
	}));
}
