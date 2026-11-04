import { describe, expect, it } from 'vitest';
import {
	anneeExerciceDe,
	bornesExercice,
	deciderAncre,
	deciderExerciceSuivant,
	deciderPremierExercice,
	deciderRepere,
	exerciceParDefaut,
	exerciceSelectionne,
	libelleExercice,
	type Exercice
} from '#lib/domaine/exercices.ts';

const ex = (
	id: number,
	anneeDebut: number,
	statut: Exercice['statut'] = 'ouvert',
	mois = 9
): Exercice => ({
	id,
	anneeDebut,
	statut,
	libelle: libelleExercice(anneeDebut, mois),
	...(statut === 'repere' ? { debut: null, fin: null } : bornesExercice(anneeDebut, mois))
});

describe('dates d’un Exercice', () => {
	it('va du 1er septembre au 31 août', () => {
		expect(libelleExercice(2026, 9)).toBe('2026-2027');
		expect(bornesExercice(2026, 9)).toEqual({ debut: '2026-09-01', fin: '2027-08-31' });
	});

	it('gère février et l’année civile', () => {
		expect(bornesExercice(2027, 3).fin).toBe('2028-02-29');
		expect(libelleExercice(2026, 1)).toBe('2026');
		expect(bornesExercice(2026, 1)).toEqual({ debut: '2026-01-01', fin: '2026-12-31' });
	});

	it('retrouve l’année de début d’une date', () => {
		expect(anneeExerciceDe('2026-11-04', 9)).toBe(2026);
		expect(anneeExerciceDe('2026-08-31', 9)).toBe(2025);
		expect(anneeExerciceDe('2026-09-01', 9)).toBe(2026);
	});
});

describe('E1 : ouverture', () => {
	it('ouvre le premier Exercice', () => {
		const r = deciderPremierExercice([ex(1, 2025, 'repere')], 2026, 9);
		expect(r.ok && r.valeur.libelle).toBe('2026-2027');
	});

	it('refuse un deuxième premier Exercice, ou un premier avant un repère', () => {
		expect(deciderPremierExercice([ex(1, 2026)], 2027, 9).ok).toBe(false);
		expect(deciderPremierExercice([ex(1, 2026, 'repere')], 2025, 9).ok).toBe(false);
	});

	it('enchaîne sans trou ni chevauchement', () => {
		const r = deciderExerciceSuivant([ex(1, 2026)], 9);
		expect(r.ok && r.valeur).toMatchObject({
			libelle: '2027-2028',
			debut: '2027-09-01',
			fin: '2028-08-31',
			statut: 'ouvert'
		});
	});

	it('refuse un troisième Exercice ouvert', () => {
		const r = deciderExerciceSuivant([ex(1, 2026), ex(2, 2027)], 9);
		expect(r).toEqual({ ok: false, erreur: { code: 'exercice_invalide' } });
	});

	it('permet le suivant quand le plus ancien est clôturé', () => {
		const r = deciderExerciceSuivant([ex(1, 2025, 'cloture'), ex(2, 2026)], 9);
		expect(r.ok && r.valeur.libelle).toBe('2027-2028');
	});

	it('exige un Exercice tenu avant de chercher le suivant', () => {
		expect(deciderExerciceSuivant([], 9).ok).toBe(false);
		expect(deciderExerciceSuivant([ex(1, 2025, 'repere')], 9).ok).toBe(false);
	});

	it('garde le calendrier du précédent si le mois de début a changé', () => {
		const r = deciderExerciceSuivant([ex(1, 2026)], 1);
		expect(r.ok && r.valeur.debut).toBe('2027-09-01');
	});
});

describe('E2 : repères', () => {
	it('lit l’année dans le nom, avant le premier Exercice tenu', () => {
		const r = deciderRepere([ex(1, 2026)], '2024-2025');
		expect(r.ok && r.valeur).toEqual({
			libelle: '2024-2025',
			anneeDebut: 2024,
			debut: null,
			fin: null,
			statut: 'repere'
		});
	});

	it('se place avant tout quand le nom ne dit rien', () => {
		const r = deciderRepere([ex(1, 2026), ex(2, 2024, 'repere')], 'Ancienne compta');
		expect(r.ok && r.valeur.anneeDebut).toBe(2023);
	});

	it('ne prend pas une année déjà tenue ou postérieure', () => {
		const r = deciderRepere([ex(1, 2026)], '2027-2028');
		expect(r.ok && r.valeur.anneeDebut).toBe(2025);
	});

	it('refuse un nom déjà pris', () => {
		expect(deciderRepere([ex(1, 2026)], '2026-2027').ok).toBe(false);
	});

	it('existe avant tout Exercice tenu', () => {
		const r = deciderRepere([], '2024-2025');
		expect(r.ok && r.valeur.anneeDebut).toBe(2024);
		const sansAnnee = deciderRepere([], 'Avant');
		expect(sansAnnee.ok && sansAnnee.valeur.anneeDebut).toBe(9998);
	});
});

describe('E6 et E7 : ancres', () => {
	it('se pose au début d’un Exercice ouvert', () => {
		expect(deciderAncre([ex(1, 2026)], 1, null).ok).toBe(true);
	});

	it('refuse un repère, un Exercice clôturé ou inconnu', () => {
		const exercices = [ex(1, 2024, 'repere'), ex(2, 2025, 'cloture'), ex(3, 2026)];
		for (const id of [1, 2, 99]) {
			expect(deciderAncre(exercices, id, null)).toEqual({
				ok: false,
				erreur: { code: 'ancre_invalide' }
			});
		}
	});

	it('E7 : se modifie tant que son Exercice et les suivants sont ouverts', () => {
		expect(deciderAncre([ex(1, 2026), ex(2, 2027)], 1, 1).ok).toBe(true);
	});

	it('E7 : se fige dès qu’un Exercice dépendant est clôturé', () => {
		const r = deciderAncre([ex(1, 2025, 'cloture'), ex(2, 2026)], 2, 1);
		expect(r).toEqual({
			ok: false,
			erreur: { code: 'exercice_cloture', details: { exercice: '2025-2026' } }
		});
	});
});

describe('Exercice affiché', () => {
	const exercices = [ex(1, 2024, 'repere'), ex(2, 2025, 'cloture'), ex(3, 2026), ex(4, 2027)];

	it('choisit l’ouvert le plus récent', () => {
		expect(exerciceParDefaut(exercices)?.id).toBe(4);
	});

	it('se rabat sur le clôturé le plus récent', () => {
		expect(exerciceParDefaut([ex(2, 2025, 'cloture')])?.id).toBe(2);
		expect(exerciceParDefaut([ex(1, 2024, 'repere')])).toBeNull();
	});

	it('suit l’URL, sauf pour un repère ou un nom inconnu', () => {
		expect(exerciceSelectionne(exercices, '2025-2026')?.id).toBe(2);
		expect(exerciceSelectionne(exercices, '2024-2025')?.id).toBe(4);
		expect(exerciceSelectionne(exercices, 'n’importe quoi')?.id).toBe(4);
		expect(exerciceSelectionne(exercices, null)?.id).toBe(4);
	});
});
