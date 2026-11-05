import { describe, expect, it } from 'vitest';
import { lireMarkdown, morceaux } from '#lib/ui/markdown.ts';

describe('lireMarkdown', () => {
	it('lit titres, paragraphes, listes et code, sans le titre du document', () => {
		const blocs = lireMarkdown(
			'# Titre\n\nUn paragraphe\nsur deux lignes.\n\n## Partie\n\n- un\n- deux\n\n1. premier\n2. second\n   suite\n\n```sh\nape verifier\n```\n\n### Détail\n'
		);
		expect(blocs.map((b) => b.type)).toEqual([
			'paragraphe',
			'titre',
			'liste',
			'liste',
			'code',
			'titre'
		]);
		expect(blocs[0]).toEqual({
			type: 'paragraphe',
			morceaux: [{ type: 'texte', texte: 'Un paragraphe sur deux lignes.' }]
		});
		expect(blocs[3]).toMatchObject({ ordonnee: true });
		expect((blocs[3] as { elements: unknown[] }).elements[1]).toEqual([
			{ type: 'texte', texte: 'second suite' }
		]);
		expect(blocs[4]).toEqual({ type: 'code', texte: 'ape verifier' });
		expect(blocs[5]).toMatchObject({ niveau: 3 });
	});

	it('garde le numéro d’une liste coupée par un bloc de code', () => {
		const blocs = lireMarkdown('1. un\n\n```sh\nape\n```\n\n2. deux\n');
		expect(blocs[0]).toMatchObject({ debut: 1 });
		expect(blocs[2]).toMatchObject({ debut: 2 });
	});

	it('rend l’apostrophe typographique, sauf dans le code', () => {
		expect(morceaux("l'outil `l'outil`")).toEqual([
			{ type: 'texte', texte: 'l’outil ' },
			{ type: 'code', texte: "l'outil" }
		]);
	});

	it('découpe le code et le gras en ligne', () => {
		expect(morceaux('Lancez `ape` **maintenant**.')).toEqual([
			{ type: 'texte', texte: 'Lancez ' },
			{ type: 'code', texte: 'ape' },
			{ type: 'texte', texte: ' ' },
			{ type: 'gras', texte: 'maintenant' },
			{ type: 'texte', texte: '.' }
		]);
	});
});
