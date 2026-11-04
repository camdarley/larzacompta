/**
 * Génère `src/lib/ui/jetons.css` depuis `src/lib/ui/jetons.source.json`, copie versionnée
 * des jetons de DESIGN.md (AD-20). Lancer `pnpm jetons` après toute modification.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Typo = {
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
	lineHeight: string;
	letterSpacing?: string;
};

export type Jetons = {
	colors: Record<string, string>;
	typography: Record<string, Typo>;
	rounded: Record<string, string>;
	spacing: Record<string, string>;
	elevation: Record<string, string>;
	mouvement: Record<string, string>;
};

const SECOURS_SERIF = "Georgia, 'Times New Roman', serif";
const SECOURS_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function famille(nom: string) {
	if (nom.startsWith('Fraunces')) return `'${nom}', ${SECOURS_SERIF}`;
	if (nom.startsWith('Source Sans')) return `'${nom}', ${SECOURS_SANS}`;
	return nom;
}

function ligne(nom: string, valeur: string) {
	return `\t--${nom}: ${valeur};`;
}

function couleurs(jetons: Jetons, sombre: boolean) {
	return Object.entries(jetons.colors)
		.filter(([nom]) => nom.endsWith('-dark') === sombre)
		.map(([nom, valeur]) => ligne(nom.replace(/-dark$/, ''), valeur));
}

function elevation(jetons: Jetons, sombre: boolean) {
	return Object.entries(jetons.elevation)
		.filter(([nom]) => nom.endsWith('-dark') === sombre)
		.map(([nom, valeur]) => ligne(`elevation-${nom.replace(/-dark$/, '')}`, valeur));
}

export function genererCss(jetons: Jetons): string {
	const constantes = [
		...Object.entries(jetons.typography).flatMap(([nom, t]) => [
			ligne(`typo-${nom}-famille`, famille(t.fontFamily)),
			ligne(`typo-${nom}-taille`, t.fontSize),
			ligne(`typo-${nom}-graisse`, t.fontWeight),
			ligne(`typo-${nom}-interligne`, t.lineHeight),
			...(t.letterSpacing ? [ligne(`typo-${nom}-chasse`, t.letterSpacing)] : [])
		]),
		...Object.entries(jetons.rounded).map(([nom, v]) => ligne(`rayon-${nom}`, v)),
		...Object.entries(jetons.spacing).map(([nom, v]) => ligne(`espace-${nom}`, v)),
		...Object.entries(jetons.mouvement).map(([nom, v]) => ligne(`mouvement-${nom}`, v))
	];
	const clair = [...couleurs(jetons, false), ...elevation(jetons, false)];
	const sombre = [...couleurs(jetons, true), ...elevation(jetons, true)];

	const bloc = (selecteur: string, lignes: string[]) => `${selecteur} {\n${lignes.join('\n')}\n}`;
	const enfant = sombre.map((l) => `\t${l}`).join('\n');

	return [
		'/* Fichier généré par scripts/generer-jetons.ts. Ne pas modifier à la main. */',
		bloc(':root', constantes),
		bloc(':root', ['\tcolor-scheme: light;', ...clair]),
		bloc(`:root[data-theme='sombre']`, ['\tcolor-scheme: dark;', ...sombre]),
		`@media (prefers-color-scheme: dark) {\n\t:root[data-theme='systeme'] {\n\t\tcolor-scheme: dark;\n${enfant}\n\t}\n}`,
		''
	].join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const source = new URL('../src/lib/ui/jetons.source.json', import.meta.url);
	const cible = new URL('../src/lib/ui/jetons.css', import.meta.url);
	writeFileSync(cible, genererCss(JSON.parse(readFileSync(source, 'utf8'))));
	console.log('jetons.css généré.');
}
