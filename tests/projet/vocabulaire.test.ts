import { describe, expect, it } from 'vitest';
import { genererCsv } from '#lib/server/infra/documents/csv.ts';
import { sources } from './fichiers.ts';

/** FR-42 : aucun de ces mots n'apparaît à l'écran, ni dans un export. */
const INTERDITS =
	/(?<!\p{L})(?:d[ée]bits?|cr[ée]dits?|[ée]critures?|contreparties?|journal comptable|num[ée]ros? de compte)(?!\p{L})/iu;

function sansCode(chemin: string, contenu: string): string {
	if (chemin.endsWith('.svelte')) {
		// Reste le balisage et ses textes. Les scripts sont examinés par leurs chaînes.
		const script = [...contenu.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => chaines(m[0]));
		const balisage = contenu
			.replace(/<script[\s\S]*?<\/script>/g, '')
			.replace(/<style[\s\S]*?<\/style>/g, '')
			.replace(/<!--[\s\S]*?-->/g, '');
		return [balisage, ...script].join('\n');
	}
	return chaines(contenu);
}

/** Les chaînes d'un fichier de code : un identifiant ou un commentaire n'est pas de l'interface. */
function chaines(code: string): string {
	const sans = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	return [...sans.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)]
		.map((m) => m[0])
		.join('\n');
}

describe('vocabulaire d’interface (FR-42)', () => {
	const fichiers = [
		...sources('src/lib', ['messages.ts', 'aide.ts', 'fonctions.ts']),
		...sources('src/lib/ui'),
		...sources('src/routes')
	];

	it('parcourt bien les messages, les composants et les routes', () => {
		expect(fichiers.length).toBeGreaterThan(80);
		expect(fichiers.some((f) => f.chemin === 'src/lib/messages.ts')).toBe(true);
		expect(fichiers.some((f) => f.chemin.endsWith('FormulaireOperation.svelte'))).toBe(true);
	});

	it.each(fichiers.map((f) => [f.chemin, f.contenu]))('%s', (chemin, contenu) => {
		const lignes = sansCode(chemin, contenu)
			.split('\n')
			.filter((l) => INTERDITS.test(l));
		expect(lignes).toEqual([]);
	});

	it('repère un mot interdit, y compris dans une chaîne de script', () => {
		expect(INTERDITS.test(sansCode('a.svelte', '<p>Votre débit</p>'))).toBe(true);
		expect(INTERDITS.test(sansCode('a.svelte', "<script>const t = 'une écriture';</script>"))).toBe(
			true
		);
		expect(INTERDITS.test(sansCode('a.ts', '// une écriture\nconst x = 1;'))).toBe(false);
	});

	it('les en-têtes d’export n’emploient aucun mot interdit', () => {
		const code = sources('src/lib/server/application/operations')
			.map((f) => chaines(f.contenu))
			.join('\n');
		expect(INTERDITS.test(code)).toBe(false);
		expect(INTERDITS.test(genererCsv(['Date', 'Montant'], [['2026-01-01', '1,00']]))).toBe(false);
	});
});
