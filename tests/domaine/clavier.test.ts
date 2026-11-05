import { describe, expect, it } from 'vitest';
import { defilementVersChamp, hauteurMasquee } from '#lib/ui/clavier.ts';

describe('clavier logiciel', () => {
	it('mesure ce que le clavier masque', () => {
		expect(hauteurMasquee(714, { height: 714, offsetTop: 0, scale: 1 })).toBe(0);
		expect(hauteurMasquee(714, { height: 413, offsetTop: 0, scale: 1 })).toBe(301);
	});

	it('tient compte du viewport déplacé par le navigateur', () => {
		expect(hauteurMasquee(714, { height: 413, offsetTop: 120, scale: 1 })).toBe(181);
	});

	it('ne prend pas un zoom pour un clavier', () => {
		expect(hauteurMasquee(714, { height: 357, offsetTop: 0, scale: 2 })).toBe(0);
	});

	it('ne rend jamais un nombre négatif', () => {
		expect(hauteurMasquee(700, { height: 714, offsetTop: 0, scale: 1 })).toBe(0);
	});

	it('remonte un champ passé sous la barre, et laisse les autres', () => {
		expect(defilementVersChamp(400, 300)).toBe(108);
		expect(defilementVersChamp(200, 300)).toBe(0);
	});
});
