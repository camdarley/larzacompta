/**
 * Invariants du §6 que le chemin d'écriture tient avant même la base : ici, ils se prouvent des
 * deux côtés. Le cas d'usage refuse, et `ape verifier` les retrouve si la base est altérée à la main.
 */
import { describe, expect, it } from 'vitest';
import { deciderCloture } from '#lib/domaine/etats/cloture.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { creerOperation, depenseSimple, instanceFictive } from './aides/fictive.ts';

const c = centimes;

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? 'ok' : r.erreur?.code);

const invariants = (i: ReturnType<typeof instanceFictive>) =>
	valeur(i.app.etats.verifier(i.ctx())).map((v) => v.invariant);

describe('Opérations', () => {
	it('O2 : `standard` porte un Côté, à la date de l’Opération', () => {
		const i = instanceFictive();
		const id = creerOperation(i, depenseSimple(i));
		expect(invariants(i)).toEqual([]);
		i.base.exec(`UPDATE cote SET date = '2026-10-06' WHERE operation_id = ${id}`);
		expect(invariants(i)).toContain('O2');
	});

	it('O3 : `interne` porte deux Côtés opposés, sur deux Comptes différents', () => {
		const i = instanceFictive();
		const interne = {
			forme: 'interne',
			libelle: 'Virement',
			note: null,
			reference: null,
			deId: i.banque,
			versId: i.banque,
			montant: c(10_00),
			parti: '2026-10-05',
			arrive: '2026-10-05'
		} as const;
		expect(code(i.app.operations.creer(i.ctx(), interne))).toBe('forme_invalide');
		const id = creerOperation(i, { ...interne, versId: i.livret });
		i.base.exec(`UPDATE cote SET compte_id = ${i.banque} WHERE operation_id = ${id}`);
		expect(invariants(i)).toContain('O3');
	});

	it('O4 : `compensee` garde une Ligne de recette et une de dépense', () => {
		const i = instanceFictive();
		const compensee = {
			forme: 'compensee',
			libelle: 'Photographe',
			reference: null,
			modePaiement: null,
			note: null,
			tiers: 'Photographe imaginaire',
			compteId: i.banque,
			date: '2026-10-05',
			facture: c(500_00),
			ventes: c(300_00),
			ligneFacture: { natureId: i.nature('Spectacle'), actionId: null },
			ligneVentes: { natureId: i.nature('Buvette'), actionId: null }
		} as const;
		const id = creerOperation(i, compensee);
		expect(invariants(i)).toEqual([]);
		i.base.exec(`DELETE FROM ligne WHERE operation_id = ${id} AND montant_centimes > 0`);
		expect(invariants(i)).toContain('O4');
	});
});

describe('Pointage', () => {
	function pointe() {
		const i = instanceFictive();
		const id = creerOperation(i, depenseSimple(i));
		const cote = i.app.socle.depots.operations.parId(id)!.cotes[0]!.id;
		const ligne = valeur(
			i.app.pointage.saisirLigne(i.ctx(), {
				compteId: i.banque,
				date: '2026-10-05',
				montant: c(-100_00),
				libelle: 'Papeterie'
			})
		);
		return { i, id, cote, ligneId: ligne.id };
	}

	it('P1 : Côtés et Lignes de relevé portent sur le Compte du Pointage', () => {
		const { i, cote, ligneId } = pointe();
		expect(
			code(
				i.app.pointage.pointer(i.ctx(), {
					compteId: i.livret,
					coteIds: [cote],
					ligneIds: [ligneId]
				})
			)
		).toBe('pointage_incoherent');
		valeur(
			i.app.pointage.pointer(i.ctx(), { compteId: i.banque, coteIds: [cote], ligneIds: [ligneId] })
		);
		expect(invariants(i)).toEqual([]);
		i.base.exec(`UPDATE ligne_releve SET compte_id = ${i.livret} WHERE id = ${ligneId}`);
		expect(invariants(i)).toContain('P1');
	});

	it('P3 : il faut au moins un Côté et une Ligne de relevé', () => {
		const { i, ligneId } = pointe();
		expect(
			code(
				i.app.pointage.pointer(i.ctx(), { compteId: i.banque, coteIds: [], ligneIds: [ligneId] })
			)
		).toBe('pointage_incoherent');
		i.base.exec(`
			INSERT INTO pointage (id, compte_id, cree_le, cree_par)
				VALUES (9, ${i.banque}, '2026-11-04T10:00:00.000Z', ${i.tresorier.id});
			INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (9, ${ligneId});
		`);
		expect(invariants(i)).toContain('P3');
	});

	it('P4 : une Ligne à confirmer ne se pointe pas', () => {
		const { i, cote, ligneId } = pointe();
		i.base.exec(`UPDATE ligne_releve SET doublon = 'a_confirmer' WHERE id = ${ligneId}`);
		expect(
			code(
				i.app.pointage.pointer(i.ctx(), {
					compteId: i.banque,
					coteIds: [cote],
					ligneIds: [ligneId]
				})
			)
		).toBe('doublon_a_confirmer');
		i.base.exec(`
			INSERT INTO pointage (id, compte_id, cree_le, cree_par)
				VALUES (9, ${i.banque}, '2026-11-04T10:00:00.000Z', ${i.tresorier.id});
			INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (9, ${cote});
			INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (9, ${ligneId});
		`);
		expect(invariants(i)).toContain('P4');
	});
});

describe('Exercices', () => {
	it('E1 : deux Exercices ouverts au plus, sans trou', () => {
		const i = instanceFictive();
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		expect(code(i.app.exercices.ouvrirSuivant(i.ctx()))).toBe('exercice_invalide');
		expect(invariants(i)).toEqual([]);
		i.base.exec(`UPDATE exercice SET debut = '2027-10-01' WHERE libelle = '2027-2028'`);
		expect(invariants(i)).toContain('E1');
	});

	it('E4 : une Session ouverte datée dans l’Exercice refuse la clôture (fixture de domaine)', () => {
		const i = instanceFictive();
		const exercices = i.app.socle.depots.exercices.lister();
		const e = i.exercice('2026-2027');
		const r = deciderCloture(exercices, e.id, [{ caisse: 'Caisse 2', date: '2026-10-05' }]);
		expect(code(r)).toBe('session_a_cloturer');
		expect(deciderCloture(exercices, e.id, []).ok).toBe(true);
	});
});
