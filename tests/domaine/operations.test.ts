import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { centimes, formaterMontant } from '#lib/domaine/montant.ts';
import {
	differentiel,
	formeCompensee,
	formeInterne,
	formeStandard,
	ligneDeSaisie,
	type LigneVentilee
} from '#lib/domaine/operations/formes.ts';
import {
	dateProposee,
	etatPointage,
	intentionDe,
	montantOperation
} from '#lib/domaine/operations/lecture.ts';
import {
	montantPourSolder,
	resteARepartir,
	totalReparti
} from '#lib/domaine/operations/ventilation.ts';
import { validerOperation } from '#lib/domaine/operations/validation.ts';
import { brouillonStandard, journal, operationJ, REFERENCES } from './aides/journal.ts';

const c = centimes;
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? 'ok' : r.erreur?.code);

function ligne(partiel: Partial<LigneVentilee> = {}): LigneVentilee {
	return {
		montant: c(1000),
		contraire: false,
		reduction: false,
		natureId: 1,
		actionId: null,
		exerciceRattachementId: null,
		note: null,
		...partiel
	};
}

const entete = {
	libelle: 'Fictif',
	reference: null,
	modePaiement: null,
	note: null,
	tiers: null
};

describe('validerOperation', () => {
	it('accepte une Opération standard équilibrée et résout le rattachement', () => {
		const r = validerOperation(brouillonStandard(), REFERENCES);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.valeur.lignes[0]?.exerciceRattachementId).toBe(2);
	});

	it('O1 : refuse une somme des Lignes différente des Côtés, avec le reste en clair', () => {
		const b = brouillonStandard({
			lignes: [{ ...brouillonStandard().lignes[0]!, montant: c(-600) }]
		});
		const r = validerOperation(b, REFERENCES);
		expect(code(r)).toBe('ventilation_incomplete');
		if (!r.ok) expect(r.erreur.details?.montant).toBe(formaterMontant(c(400)));
	});

	it('O1 (propriété) : Côté et Lignes équilibrés passent, sinon refus', () => {
		const montants = fc.array(fc.integer({ min: 1, max: 5_000_000 }), {
			minLength: 1,
			maxLength: 12
		});
		fc.assert(
			fc.property(montants, fc.integer({ min: -3, max: 3 }), (parts, ecart) => {
				const total = parts.reduce((a, b) => a + b, 0);
				if (total + ecart === 0) return;
				const b = formeStandard({
					...entete,
					intention: 'depense',
					compteId: 1,
					date: '2026-10-05',
					montant: c(total + ecart),
					lignes: parts.map((p) => ligne({ montant: c(p) }))
				});
				const r = validerOperation(b, REFERENCES);
				expect(r.ok).toBe(ecart === 0);
			})
		);
	});

	it('O2 : une standard a un seul Côté, à sa date, et au moins une Ligne', () => {
		const b = brouillonStandard();
		expect(code(validerOperation({ ...b, lignes: [] }, REFERENCES))).toBe('forme_invalide');
		expect(code(validerOperation({ ...b, cotes: [] }, REFERENCES))).toBe('forme_invalide');
		expect(code(validerOperation({ ...b, cotes: [b.cotes[0]!, b.cotes[0]!] }, REFERENCES))).toBe(
			'forme_invalide'
		);
		expect(
			code(validerOperation({ ...b, cotes: [{ ...b.cotes[0]!, date: '2026-10-06' }] }, REFERENCES))
		).toBe('forme_invalide');
	});

	it('refuse un montant nul', () => {
		const b = brouillonStandard();
		expect(
			code(validerOperation({ ...b, cotes: [{ ...b.cotes[0]!, montant: c(0) }] }, REFERENCES))
		).toBe('forme_invalide');
	});

	it('O3 : un Mouvement interne a deux Côtés opposés, sur deux Comptes, sans Ligne', () => {
		const b = formeInterne({
			libelle: 'Virement fictif',
			note: null,
			reference: null,
			deId: 1,
			versId: 2,
			montant: c(5000),
			parti: '2026-10-05',
			arrive: '2026-10-07'
		});
		expect(b.date).toBe('2026-10-05');
		expect(b.cotes.map((x) => x.montant)).toEqual([-5000, 5000]);
		expect(validerOperation(b, REFERENCES).ok).toBe(true);

		expect(
			code(
				validerOperation(
					{ ...b, cotes: [b.cotes[0]!, { ...b.cotes[1]!, compteId: 1 }] },
					REFERENCES
				)
			)
		).toBe('forme_invalide');
		expect(
			code(
				validerOperation(
					{ ...b, cotes: [b.cotes[0]!, { ...b.cotes[1]!, montant: c(4000) }] },
					REFERENCES
				)
			)
		).toBe('forme_invalide');
		expect(code(validerOperation({ ...b, cotes: [b.cotes[0]!] }, REFERENCES))).toBe(
			'forme_invalide'
		);
		expect(code(validerOperation({ ...b, lignes: brouillonStandard().lignes }, REFERENCES))).toBe(
			'forme_invalide'
		);
		expect(code(validerOperation({ ...b, date: '2026-10-07' }, REFERENCES))).toBe('forme_invalide');
	});

	it('O4 : une compensée porte une recette et une dépense, et son différentiel', () => {
		const s = {
			...entete,
			compteId: 1,
			date: '2026-10-05',
			facture: c(50000),
			ventes: c(30000),
			ligneFacture: { natureId: 1, actionId: 1 },
			ligneVentes: { natureId: 1, actionId: 1 }
		};
		const b = formeCompensee(s);
		expect(b.lignes.map((l) => l.montant)).toEqual([30000, -50000]);
		expect(b.cotes).toEqual([{ compteId: 1, date: '2026-10-05', montant: -20000 }]);
		expect(validerOperation(b, REFERENCES).ok).toBe(true);

		const nul = formeCompensee({ ...s, ventes: c(50000) });
		expect(nul.cotes).toEqual([]);
		expect(validerOperation(nul, REFERENCES).ok).toBe(true);

		const positif = formeCompensee({ ...s, ventes: c(60000) });
		expect(positif.cotes[0]?.montant).toBe(10000);
		expect(validerOperation(positif, REFERENCES).ok).toBe(true);

		expect(
			code(
				validerOperation(
					{ ...b, lignes: [b.lignes[1]!], cotes: [{ ...b.cotes[0]!, montant: c(-50000) }] },
					REFERENCES
				)
			)
		).toBe('forme_invalide');
		expect(code(validerOperation({ ...b, cotes: [b.cotes[0]!, b.cotes[0]!] }, REFERENCES))).toBe(
			'forme_invalide'
		);
		expect(
			code(validerOperation({ ...b, cotes: [{ ...b.cotes[0]!, date: '2026-10-06' }] }, REFERENCES))
		).toBe('forme_invalide');
		expect(differentiel(c(300), c(500))).toBe(-200);
	});

	it('O5 : refuse une date hors d’un Exercice ouvert', () => {
		const fermee = '2026-03-12';
		const b = brouillonStandard({
			date: fermee,
			cotes: [{ compteId: 2, date: fermee, montant: c(-1000) }]
		});
		expect(code(validerOperation(b, REFERENCES))).toBe('date_hors_exercice');
		const horsDeTout = '2030-01-01';
		expect(
			code(
				validerOperation(
					brouillonStandard({
						date: horsDeTout,
						cotes: [{ compteId: 1, date: horsDeTout, montant: c(-1000) }]
					}),
					REFERENCES
				)
			)
		).toBe('date_hors_exercice');
	});

	it('O5 : refuse un Côté avant l’ancre du Compte', () => {
		const references = {
			...REFERENCES,
			exercices: REFERENCES.exercices.map((e) =>
				e.id === 1 ? { ...e, statut: 'ouvert' as const } : e
			)
		};
		const date = '2026-03-12';
		const b = brouillonStandard({
			date,
			cotes: [{ compteId: 1, date, montant: c(-1000) }]
		});
		expect(code(validerOperation(b, references))).toBe('date_hors_exercice');
		const sansAncre = { ...b, cotes: [{ compteId: 2, date, montant: c(-1000) }] };
		expect(validerOperation(sansAncre, references).ok).toBe(true);
	});

	it('O5 : contrôle chaque Côté d’un Mouvement interne', () => {
		const b = formeInterne({
			libelle: 'Virement fictif',
			note: null,
			reference: null,
			deId: 1,
			versId: 2,
			montant: c(5000),
			parti: '2026-10-05',
			arrive: '2027-09-02'
		});
		expect(code(validerOperation(b, REFERENCES))).toBe('date_hors_exercice');
	});

	it('O6 : rattache à l’Exercice de la date, ou à un antérieur, repère compris', () => {
		const base = brouillonStandard();
		const avec = (id: number | null) =>
			validerOperation(
				{ ...base, lignes: [{ ...base.lignes[0]!, exerciceRattachementId: id }] },
				REFERENCES
			);
		expect(avec(2).ok).toBe(true);
		expect(avec(1).ok).toBe(true);
		expect(avec(3).ok).toBe(true);
		expect(code(avec(99))).toBe('rattachement_invalide');
		const suivant = {
			...REFERENCES,
			exercices: [
				...REFERENCES.exercices,
				{
					id: 4,
					libelle: '2027-2028',
					anneeDebut: 2027,
					debut: '2027-09-01',
					fin: '2028-08-31',
					statut: 'ouvert' as const
				}
			]
		};
		const r = validerOperation(
			{ ...base, lignes: [{ ...base.lignes[0]!, exerciceRattachementId: 4 }] },
			suivant
		);
		expect(code(r)).toBe('rattachement_invalide');
	});

	it('O11 : une Nature ou Action inactive est refusée sur une nouvelle Ligne', () => {
		const base = brouillonStandard();
		const nature = { ...base, lignes: [{ ...base.lignes[0]!, natureId: 2 }] };
		const action = { ...base, lignes: [{ ...base.lignes[0]!, actionId: 2 }] };
		expect(code(validerOperation(nature, REFERENCES))).toBe('reference_inactive');
		expect(code(validerOperation(action, REFERENCES))).toBe('reference_inactive');
		const existant = { natureIds: [2], actionIds: [2] };
		expect(validerOperation(nature, REFERENCES, existant).ok).toBe(true);
		expect(validerOperation(action, REFERENCES, existant).ok).toBe(true);
	});

	it('refuse une référence inconnue et un Compte désactivé', () => {
		const base = brouillonStandard();
		const nature = { ...base, lignes: [{ ...base.lignes[0]!, natureId: 9 }] };
		const action = { ...base, lignes: [{ ...base.lignes[0]!, actionId: 9 }] };
		expect(code(validerOperation(nature, REFERENCES))).toBe('element_introuvable');
		expect(code(validerOperation(action, REFERENCES))).toBe('element_introuvable');
		const compte = (id: number) => ({ ...base, cotes: [{ ...base.cotes[0]!, compteId: id }] });
		expect(code(validerOperation(compte(9), REFERENCES))).toBe('element_introuvable');
		expect(code(validerOperation(compte(3), REFERENCES))).toBe('compte_inactif');
	});
});

describe('formes', () => {
	it('une Dépense sort, une Recette entre, sans signe à saisir', () => {
		const s = {
			...entete,
			compteId: 1,
			date: '2026-10-05',
			montant: c(1000),
			lignes: [ligne()]
		};
		const d = formeStandard({ ...s, intention: 'depense' });
		expect(d.cotes[0]?.montant).toBe(-1000);
		expect(d.lignes[0]?.montant).toBe(-1000);
		const r = formeStandard({ ...s, intention: 'recette' });
		expect(r.cotes[0]?.montant).toBe(1000);
		expect(r.lignes[0]?.montant).toBe(1000);
	});

	it('une Ligne de sens contraire réduit une dépense, et reste une dépense dans une recette', () => {
		const contraire = ligne({ contraire: true });
		expect(ligneDeSaisie(contraire, 'depense')).toMatchObject({
			montant: 1000,
			estReduction: true
		});
		expect(ligneDeSaisie(contraire, 'recette')).toMatchObject({
			montant: -1000,
			estReduction: false
		});
		expect(ligneDeSaisie(ligne({ reduction: true }), 'recette')).toMatchObject({
			montant: 1000,
			estReduction: true
		});
	});
});

describe('reste à répartir', () => {
	const part = (m: number, contraire = false) => ({ montant: c(m), contraire });

	it('compte les Lignes dans le sens de l’Opération', () => {
		expect(totalReparti([part(600), part(250), part(150)])).toBe(1000);
		expect(totalReparti([part(120), part(20, true)])).toBe(100);
		expect(resteARepartir(c(1000), [part(600)])).toBe(400);
		expect(resteARepartir(c(1000), [part(1050)])).toBe(-50);
		expect(resteARepartir(c(1000), [part(600), part(250), part(150)])).toBe(0);
	});

	it('`=` remplit ce qui manque à la Ligne visée', () => {
		const lignes = [part(600), part(0), part(100)];
		expect(montantPourSolder(c(1000), lignes, 1)).toBe(300);
		expect(montantPourSolder(c(100), [part(0, true), part(120)], 0)).toBe(20);
		expect(montantPourSolder(c(100), [part(300), part(0)], 1)).toBe(0);
	});

	it('(propriété) la dernière Ligne solde toujours', () => {
		const parts = fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 1, maxLength: 8 });
		fc.assert(
			fc.property(parts, (montants) => {
				const lignes = montants.map((m) => part(m));
				const total = c(montants.reduce((a, b) => a + b, 0) + 1);
				const avec = [...lignes, part(0)];
				const solde = montantPourSolder(total, avec, avec.length - 1);
				expect(resteARepartir(total, [...lignes, part(solde)])).toBe(0);
			})
		);
	});
});

describe('lecture', () => {
	it('déduit le montant et l’intention', () => {
		const depense = operationJ({ montant: -1000 });
		expect(montantOperation(depense)).toBe(-1000);
		expect(intentionDe(depense)).toBe('depense');
		expect(intentionDe(operationJ({ montant: 500 }))).toBe('recette');
		expect(montantOperation({ genre: 'compensee', cotes: [] })).toBe(0);
		const interne = operationJ({ genre: 'interne', montant: -1000, lignes: [] });
		expect(montantOperation(interne)).toBe(1000);
	});

	it('déduit l’état Pointé du Pointage', () => {
		const op = operationJ();
		const coteId = (op.cotes[0] as { id: number }).id;
		const avec = journal({
			pointages: [
				{
					id: 1,
					compteId: 1,
					coteIds: [coteId],
					ligneReleveIds: [1],
					creeLe: '2026-11-01T10:00:00.000Z'
				}
			]
		});
		expect(etatPointage(avec, op)).toBe('pointe');
		expect(etatPointage(journal(), op)).toBe('a_pointer');
	});

	it('propose une date dans l’Exercice regardé', () => {
		const e = { debut: '2025-09-01', fin: '2026-08-31' };
		expect(dateProposee('2026-03-12', e)).toBe('2026-03-12');
		expect(dateProposee('2026-11-05', e)).toBe('2026-08-31');
		expect(dateProposee('2025-01-01', e)).toBe('2025-09-01');
		expect(dateProposee('2026-11-05', null)).toBe('2026-11-05');
	});
});
