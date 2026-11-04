import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	centimes,
	formaterMontant,
	formaterMontantSigne,
	formaterSaisie,
	lectureMontant,
	lireMontant,
	sommeCentimes,
	type Centimes
} from '#lib/domaine/montant.ts';

const INS = ' ';
const FINE = ' ';

function valeur(texte: string) {
	const r = lireMontant(texte);
	if (!r.ok) throw new Error(`${texte} : ${r.erreur.code}`);
	return r.valeur;
}

describe('lireMontant', () => {
	it.each([
		['1000', 100000],
		['1 000,5', 100050],
		['1000.50', 100050],
		['220+180', 40000],
		['0', 0],
		['0,01', 1],
		[',5', 50],
		['  12  ', 1200],
		['1 234,56 €', 123456],
		['12,50 €', 1250],
		['-12,50', -1250],
		['−12,50', -1250],
		['+ 200,00 €', 20000],
		['100-20', 8000],
		['100 − 20,50', 7950],
		['0.1+0.2', 30],
		['1,10+2,20+3,30', 660],
		['1 234 567,89', 123456789]
	])('lit %s', (texte, attendu) => {
		expect(valeur(texte)).toBe(attendu);
	});

	it.each([
		['12,345'],
		['abc'],
		['1++2'],
		[''],
		['   '],
		['€'],
		['1,2,3'],
		['12 34'],
		['1+'],
		['+'],
		['2*3'],
		['1e3'],
		['Infinity'],
		['99999999999999999999']
	])('refuse %s sans lever', (texte) => {
		const r = lireMontant(texte);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.erreur.code).toMatch(/^[a-z]+(_[a-z]+)*$/);
	});

	it("n'utilise ni parseFloat, ni eval, ni Number sur un décimal", async () => {
		const { readFileSync } = await import('node:fs');
		const source = readFileSync('src/lib/domaine/montant.ts', 'utf8');
		expect(source).not.toMatch(/parseFloat|eval\(|new Function|toFixed/);
	});

	it('propriété : la somme de deux saisies vaut la saisie de leur addition', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100_000_000 }),
				fc.integer({ min: 0, max: 100_000_000 }),
				(a, b) => {
					const texte = `${formaterSaisie(a as Centimes)}+${formaterSaisie(b as Centimes)}`;
					expect(valeur(texte)).toBe(a + b);
				}
			)
		);
	});
});

describe('formaterMontant', () => {
	it('suit la règle des montants', () => {
		expect(formaterMontant(centimes(-123456))).toBe(`−${INS}1${FINE}234,56${INS}€`);
		expect(formaterMontant(centimes(0))).toBe(`0,00${INS}€`);
		expect(formaterMontant(centimes(5))).toBe(`0,05${INS}€`);
		expect(formaterMontant(centimes(123456789))).toBe(`1${FINE}234${FINE}567,89${INS}€`);
		expect(formaterMontant(centimes(-1))).toBe(`−${INS}0,01${INS}€`);
	});

	it('emploie U+2212, jamais un tiret', () => {
		const texte = formaterMontant(centimes(-100));
		expect(texte.codePointAt(0)).toBe(0x2212);
		expect(texte).not.toContain('-');
	});

	it('signe une liste mêlant dépenses et recettes', () => {
		expect(formaterMontantSigne(centimes(20000))).toBe(`+${INS}200,00${INS}€`);
		expect(formaterMontantSigne(centimes(-12000))).toBe(`−${INS}120,00${INS}€`);
		expect(formaterMontantSigne(centimes(0))).toBe(`0,00${INS}€`);
	});

	it('formate une saisie sans symbole', () => {
		expect(formaterSaisie(centimes(100050))).toBe(`1${FINE}000,50`);
		expect(formaterSaisie(centimes(-1250))).toBe(`−12,50`);
	});
});

describe('lectureMontant', () => {
	it.each([
		[-123456, 'moins 1 234 euros 56'],
		[0, '0 euro'],
		[100, '1 euro'],
		[200, '2 euros'],
		[-12000, 'moins 120 euros'],
		[50, '50 centimes'],
		[1, '1 centime'],
		[105, '1 euro 05'],
		[123456789, '1 234 567 euros 89']
	])('lit %i', (c, attendu) => {
		expect(lectureMontant(centimes(c))).toBe(attendu);
	});
});

describe('centimes', () => {
	it('refuse un flottant', () => {
		expect(() => centimes(1.5)).toThrow();
		expect(() => centimes(Number.NaN)).toThrow();
		expect(() => centimes(2 ** 60)).toThrow();
	});

	it('somme sans arrondi', () => {
		expect(sommeCentimes([centimes(10), centimes(20), centimes(-5)])).toBe(25);
		expect(sommeCentimes([])).toBe(0);
	});
});

describe('propriétés du parseur et du formateur', () => {
	const borne = 2 ** 45;
	const arbitraire = fc.integer({ min: -borne, max: borne });

	it('lire(formater(x)) = x', () => {
		fc.assert(
			fc.property(arbitraire, (x) => {
				expect(valeur(formaterMontant(x as Centimes))).toBe(x);
				expect(valeur(formaterMontantSigne(x as Centimes))).toBe(x);
				expect(valeur(formaterSaisie(x as Centimes))).toBe(x);
			})
		);
	});

	it('le format garde toujours deux décimales', () => {
		fc.assert(
			fc.property(arbitraire, (x) => {
				expect(formaterMontant(x as Centimes)).toMatch(/,\d{2} €$/);
			})
		);
	});
});
