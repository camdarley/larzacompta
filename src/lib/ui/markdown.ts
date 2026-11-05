/**
 * Le sous-ensemble de Markdown de `docs/` : titres, paragraphes, listes, blocs de code.
 * Rendu en texte, jamais en HTML : le document ne sort pas du cadre du composant.
 */
export type Morceau = { type: 'texte' | 'code' | 'gras'; texte: string };

export type Bloc =
	| { type: 'titre'; niveau: 2 | 3; morceaux: Morceau[] }
	| { type: 'paragraphe'; morceaux: Morceau[] }
	| { type: 'liste'; ordonnee: boolean; debut: number; elements: Morceau[][] }
	| { type: 'code'; texte: string };

/** L'apostrophe droite des sources devient typographique à l'écran, hors du code. */
const typographier = (texte: string) => texte.replaceAll("'", '’');

export function morceaux(texte: string): Morceau[] {
	const motif = /`([^`]+)`|\*\*([^*]+)\*\*/g;
	const resultat: Morceau[] = [];
	let position = 0;
	for (const m of texte.matchAll(motif)) {
		if (m.index > position) {
			resultat.push({ type: 'texte', texte: typographier(texte.slice(position, m.index)) });
		}
		resultat.push(
			m[1] === undefined ? { type: 'gras', texte: m[2] as string } : { type: 'code', texte: m[1] }
		);
		position = m.index + m[0].length;
	}
	if (position < texte.length) {
		resultat.push({ type: 'texte', texte: typographier(texte.slice(position)) });
	}
	return resultat;
}

const ELEMENT = /^(?:- |\d+\. )/;

export function lireMarkdown(source: string): Bloc[] {
	const lignes = source.split('\n');
	const blocs: Bloc[] = [];
	let i = 0;
	const avancer = (tant: (ligne: string) => boolean) => {
		const pris: string[] = [];
		while (i < lignes.length && tant(lignes[i] as string)) pris.push(lignes[i++] as string);
		return pris;
	};

	while (i < lignes.length) {
		const ligne = lignes[i] as string;
		if (ligne.trim() === '') {
			i += 1;
		} else if (ligne.startsWith('```')) {
			i += 1;
			blocs.push({ type: 'code', texte: avancer((l) => !l.startsWith('```')).join('\n') });
			i += 1;
		} else if (/^#{1,3} /.test(ligne)) {
			i += 1;
			// Le `#` du document est le titre de la page, déjà porté par l'en-tête.
			if (ligne.startsWith('# ')) continue;
			blocs.push({
				type: 'titre',
				niveau: ligne.startsWith('### ') ? 3 : 2,
				morceaux: morceaux(ligne.replace(/^#+ /, ''))
			});
		} else if (ELEMENT.test(ligne)) {
			const ordonnee = !ligne.startsWith('- ');
			// Un bloc de code coupe une liste : la suite garde son numéro.
			const debut = ordonnee ? Number.parseInt(ligne, 10) : 1;
			const pris = avancer((l) => ELEMENT.test(l) || /^\s+\S/.test(l));
			const elements = pris.reduce<string[]>(
				(tous, l) =>
					ELEMENT.test(l)
						? [...tous, l.replace(ELEMENT, '')]
						: [...tous.slice(0, -1), `${tous.at(-1)} ${l.trim()}`],
				[]
			);
			blocs.push({ type: 'liste', ordonnee, debut, elements: elements.map(morceaux) });
		} else {
			const fin = (l: string) =>
				l.trim() !== '' && !l.startsWith('```') && !/^#/.test(l) && !ELEMENT.test(l);
			blocs.push({ type: 'paragraphe', morceaux: morceaux(avancer(fin).join(' ')) });
		}
	}
	return blocs;
}
