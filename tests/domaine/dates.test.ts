import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	ajouterJours,
	dateValide,
	formaterDateCourte,
	formaterDateLongue,
	formaterHorodatage,
	instantVersDate,
	lireDate
} from '#lib/domaine/dates.ts';

describe('instantVersDate', () => {
	it.each([
		// 31 août à minuit : un jour de changement d'Exercice.
		['2026-08-31T21:59:59.000Z', '2026-08-31'],
		['2026-08-31T22:00:00.000Z', '2026-09-01'],
		// Passage à l'heure d'été, 29 mars 2026.
		['2026-03-28T22:59:59.000Z', '2026-03-28'],
		['2026-03-28T23:00:00.000Z', '2026-03-29'],
		['2026-03-29T21:59:59.000Z', '2026-03-29'],
		['2026-03-29T22:00:00.000Z', '2026-03-30'],
		// Passage à l'heure d'hiver, 25 octobre 2026.
		['2026-10-24T21:59:59.000Z', '2026-10-24'],
		['2026-10-24T22:00:00.000Z', '2026-10-25'],
		['2026-10-25T22:59:59.000Z', '2026-10-25'],
		['2026-10-25T23:00:00.000Z', '2026-10-26']
	])('%s donne %s', (instant, date) => {
		expect(instantVersDate(instant)).toBe(date);
	});
});

describe('formats', () => {
	it('écrit une date en texte et en tableau', () => {
		expect(formaterDateLongue('2026-03-12')).toBe('12 mars 2026');
		expect(formaterDateCourte('2026-03-12')).toBe('12/03/2026');
		expect(formaterDateLongue('2026-09-01')).toBe('1er septembre 2026');
		expect(formaterDateLongue('2026-08-31')).toBe('31 août 2026');
	});

	it('horodate en heure de Paris', () => {
		expect(formaterHorodatage('2026-03-12T17:05:00.000Z')).toBe('12/03/2026 à 18:05');
	});

	it('lit les deux formats de saisie', () => {
		expect(lireDate('12/03/2026')).toEqual({ ok: true, valeur: '2026-03-12' });
		expect(lireDate('2026-03-12')).toEqual({ ok: true, valeur: '2026-03-12' });
		expect(lireDate(' 1/9/2026 ')).toEqual({ ok: true, valeur: '2026-09-01' });
	});

	it.each(['31/02/2026', '12/13/2026', 'demain', '', '2026-02-30', '0/1/2026'])(
		'refuse %s',
		(texte) => {
			const r = lireDate(texte);
			expect(r.ok).toBe(false);
		}
	);

	it('connaît les années bissextiles', () => {
		expect(dateValide('2028-02-29')).toBe(true);
		expect(dateValide('2026-02-29')).toBe(false);
		expect(dateValide('2100-02-29')).toBe(false);
		expect(dateValide('2000-02-29')).toBe(true);
	});
});

describe('ajouterJours', () => {
	it('traverse les mois, les années et le changement d heure', () => {
		expect(ajouterJours('2026-08-31', 1)).toBe('2026-09-01');
		expect(ajouterJours('2026-09-01', -1)).toBe('2026-08-31');
		expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
		expect(ajouterJours('2026-03-28', 2)).toBe('2026-03-30');
	});

	it('propriété : ajouter puis retirer revient au départ', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2000, max: 2100 }),
				fc.integer({ min: 1, max: 12 }),
				fc.integer({ min: 1, max: 28 }),
				fc.integer({ min: -1000, max: 1000 }),
				(a, m, j, n) => {
					const d = `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
					expect(ajouterJours(ajouterJours(d, n), -n)).toBe(d);
				}
			)
		);
	});
});
