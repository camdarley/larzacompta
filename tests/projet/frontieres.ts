/** Contrôle des frontières d'AD-1, séparé du test pour pouvoir l'éprouver sur de faux fichiers. */
export type FichierSource = { chemin: string; contenu: string };
export type Ecart = { chemin: string; raison: string };

const RE_IMPORT =
	/(?:import\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

export function importsDe(contenu: string): string[] {
	return [...contenu.matchAll(RE_IMPORT)].map((m) => m[1] as string);
}

function estLocal(i: string) {
	return i.startsWith('./') || i.startsWith('../');
}

function sansCommentaires(contenu: string) {
	return contenu.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function ecartsFrontieres(fichiers: FichierSource[]): Ecart[] {
	const ecarts: Ecart[] = [];
	for (const { chemin, contenu } of fichiers) {
		const code = sansCommentaires(contenu);
		const imports = importsDe(code);
		const noter = (raison: string) => ecarts.push({ chemin, raison });

		if (chemin.startsWith('src/lib/domaine/')) {
			for (const i of imports) {
				if (!estLocal(i) && !i.startsWith('#lib/domaine/')) noter(`importe ${i}`);
			}
			if (/\bDate\.now\s*\(/.test(code)) noter('appelle Date.now()');
			if (/\bMath\.random\s*\(/.test(code)) noter('appelle Math.random()');
			if (/\bnew Date\(\s*\)/.test(code)) noter("lit l'horloge avec new Date()");
		}

		const interface_ = chemin.startsWith('src/routes/') || chemin.startsWith('src/lib/ui/');
		if (interface_ || chemin === 'src/hooks.server.ts') {
			for (const i of imports) {
				if (i.includes('server/infra')) noter(`importe l'infrastructure : ${i}`);
				if (i === 'better-sqlite3') noter('importe better-sqlite3');
			}
		}

		if (chemin.startsWith('src/lib/ui/')) {
			for (const i of imports) {
				if (i.startsWith('#lib/server/')) noter(`importe le serveur : ${i}`);
			}
		}

		if (chemin.startsWith('src/lib/server/application/')) {
			for (const i of imports) {
				if (i.includes('/infra/') || i.startsWith('node:') || i === 'better-sqlite3') {
					noter(`importe un adaptateur : ${i}`);
				}
			}
		}

		// Seul composition.ts instancie les adaptateurs (AD-1).
		if (chemin !== 'src/lib/server/composition.ts' && !chemin.includes('/infra/')) {
			for (const i of imports) {
				if (i.startsWith('#lib/server/infra/') && !chemin.startsWith('src/cli/')) {
					noter(`instancie un adaptateur hors de composition.ts : ${i}`);
				}
			}
		}
	}
	return ecarts;
}
