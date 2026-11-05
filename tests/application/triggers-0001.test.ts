import { beforeEach, describe, expect, it } from 'vitest';
import { traduireErreurSqlite } from '#lib/server/infra/sqlite/erreurs.ts';
import type { Base } from '#lib/server/infra/sqlite/connexion.ts';
import { baseAvecCloture } from './aides/base.ts';

let base: Base;

beforeEach(() => {
	base = baseAvecCloture();
});

/** Le refus doit passer par la traduction unique, avec le bon code métier. */
function refus(sql: string, code: string) {
	let erreur: unknown;
	try {
		base.exec(sql);
	} catch (e) {
		erreur = e;
	}
	expect(erreur, `aucun refus pour : ${sql}`).toBeDefined();
	expect(traduireErreurSqlite(erreur)?.code).toBe(code);
}

const CHEQUE = `INSERT INTO operation (genre, date, libelle, cree_le, cree_par)`;

/** Chaque trigger : un cas permis, un cas refusé. */
const cas: Record<string, { permis: string; refuse: string; code: string }> = {
	exercice_cloture_fige: {
		permis: `UPDATE exercice SET libelle = '2026-27' WHERE id = 2`,
		refuse: `UPDATE exercice SET statut = 'ouvert' WHERE id = 1`,
		code: 'exercice_cloture'
	},
	exercice_cloture_sans_suppression: {
		permis: `INSERT INTO exercice (id, libelle, annee_debut, statut) VALUES (9, '2000', 2000, 'repere');
		         DELETE FROM exercice WHERE id = 9`,
		refuse: `DELETE FROM exercice WHERE id = 1`,
		code: 'exercice_cloture'
	},
	cloture_immuable_maj: {
		permis: `SELECT * FROM cloture_exercice`,
		refuse: `UPDATE cloture_exercice SET empreinte_sha256 = 'x'`,
		code: 'exercice_cloture'
	},
	cloture_immuable_suppr: {
		permis: `SELECT * FROM cloture_exercice`,
		refuse: `DELETE FROM cloture_exercice`,
		code: 'exercice_cloture'
	},
	operation_verrou_creation: {
		permis: `${CHEQUE} VALUES ('standard', '2026-11-02', 'Ok', 'x', 1)`,
		refuse: `${CHEQUE} VALUES ('standard', '2026-03-01', 'Non', 'x', 1)`,
		code: 'exercice_cloture'
	},
	operation_verrou_maj: {
		permis: `UPDATE operation SET libelle = 'Ok' WHERE id = 2;
		         UPDATE operation SET sans_piece = 1, version = 2 WHERE id = 1`,
		refuse: `UPDATE operation SET libelle = 'Non' WHERE id = 1`,
		code: 'exercice_cloture'
	},
	operation_sans_suppression: {
		permis: `UPDATE operation SET annulee_le = 'x', annulee_par = 1 WHERE id = 2`,
		refuse: `DELETE FROM operation WHERE id = 2`,
		code: 'operation_non_supprimable'
	},
	cote_verrou_creation: {
		permis: `INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (2, 1, '2026-11-02', 100)`,
		refuse: `INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (2, 1, '2026-03-02', 100)`,
		code: 'exercice_cloture'
	},
	cote_verrou_maj: {
		permis: `UPDATE cote SET montant_centimes = -3000 WHERE id = 2`,
		refuse: `UPDATE cote SET date = '2026-03-02' WHERE id = 2`,
		code: 'exercice_cloture'
	},
	cote_verrou_suppr: {
		permis: `DELETE FROM cote WHERE id = 2`,
		refuse: `DELETE FROM pointage_cote WHERE cote_id = 1; DELETE FROM cote WHERE id = 1`,
		code: 'exercice_cloture'
	},
	cote_pointe_verrou_maj: {
		permis: `UPDATE cote SET date = '2026-10-06' WHERE id = 2`,
		refuse: `INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (2, 2);
		         UPDATE cote SET montant_centimes = -3000 WHERE id = 2`,
		code: 'cote_pointe'
	},
	cote_pointe_verrou_suppr: {
		permis: `DELETE FROM cote WHERE id = 2`,
		refuse: `INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (2, 2);
		         DELETE FROM cote WHERE id = 2`,
		code: 'cote_pointe'
	},
	operation_annulation_pointee: {
		permis: `UPDATE operation SET annulee_le = 'x', annulee_par = 1 WHERE id = 2`,
		refuse: `INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (2, 2);
		         UPDATE operation SET annulee_le = 'x', annulee_par = 1 WHERE id = 2`,
		code: 'cote_pointe'
	},
	ligne_verrou_creation: {
		permis: `INSERT INTO ligne (operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id) VALUES (2, 2, 100, 1, 2)`,
		refuse: `INSERT INTO ligne (operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id) VALUES (1, 2, 100, 1, 1)`,
		code: 'exercice_cloture'
	},
	ligne_verrou_maj: {
		permis: `UPDATE ligne SET note = 'Ok' WHERE id = 2`,
		refuse: `UPDATE ligne SET note = 'Non' WHERE id = 1`,
		code: 'exercice_cloture'
	},
	ligne_verrou_suppr: {
		permis: `DELETE FROM ligne WHERE id = 2`,
		refuse: `DELETE FROM ligne WHERE id = 1`,
		code: 'exercice_cloture'
	},
	pointage_verrou_suppr: {
		permis: `INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (2, 2); DELETE FROM pointage WHERE id = 2`,
		refuse: `DELETE FROM pointage WHERE id = 1`,
		code: 'pointage_fige'
	},
	balance_verrou_maj: {
		permis: `UPDATE balance_ouverture SET solde_centimes = 1 WHERE compte_id = 2`,
		refuse: `UPDATE balance_ouverture SET solde_centimes = 1 WHERE compte_id = 1`,
		code: 'exercice_cloture'
	},
	balance_verrou_suppr: {
		permis: `DELETE FROM balance_ouverture WHERE compte_id = 2`,
		refuse: `DELETE FROM balance_ouverture WHERE compte_id = 1`,
		code: 'exercice_cloture'
	},
	constat_verrou_creation: {
		permis: `INSERT INTO constat_solde (compte_id, date, solde_centimes, source, cree_le, cree_par) VALUES (1, '2026-11-01', 1, 'saisie', 'x', 1)`,
		refuse: `INSERT INTO constat_solde (compte_id, date, solde_centimes, source, cree_le, cree_par) VALUES (1, '2026-03-01', 1, 'saisie', 'x', 1)`,
		code: 'exercice_cloture'
	},
	constat_verrou_maj: {
		permis: `UPDATE constat_solde SET solde_centimes = 1 WHERE id = 2`,
		refuse: `UPDATE constat_solde SET solde_centimes = 1 WHERE id = 1`,
		code: 'exercice_cloture'
	},
	constat_verrou_suppr: {
		permis: `DELETE FROM constat_solde WHERE id = 2`,
		refuse: `DELETE FROM constat_solde WHERE id = 1`,
		code: 'exercice_cloture'
	},
	balance_ancre_creation: {
		permis: `INSERT INTO compte (id, libelle, type) VALUES (9, 'Neuf', 'banque');
		         INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (9, 2, 1)`,
		refuse: `DELETE FROM balance_ouverture WHERE compte_id = 2;
		         INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par) VALUES (9, 'standard', '2026-10-06', 'Mvt', 'x', 1);
		         INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (9, 2, '2026-10-06', 1);
		         INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut) VALUES (3, '2027-2028', 2027, '2027-09-01', '2028-08-31', 'ouvert');
		         INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (2, 3, 1)`,
		code: 'ancre_invalide'
	},
	balance_ancre_maj: {
		permis: `UPDATE balance_ouverture SET exercice_id = 2 WHERE compte_id = 2`,
		refuse: `INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par) VALUES (9, 'standard', '2026-10-06', 'Mvt', 'x', 1);
		         INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (9, 2, '2026-10-06', 1);
		         INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut) VALUES (3, '2027-2028', 2027, '2027-09-01', '2028-08-31', 'ouvert');
		         UPDATE balance_ouverture SET exercice_id = 3 WHERE compte_id = 2`,
		code: 'ancre_invalide'
	},
	creance_verrou_anterieure: {
		permis: `INSERT INTO creance_dette (sens, tiers, motif, montant_centimes, date, cree_le, cree_par) VALUES ('dette', 'T', 'M', 1, '2026-09-01', 'x', 1)`,
		refuse: `INSERT INTO creance_dette (sens, tiers, motif, montant_centimes, date, cree_le, cree_par) VALUES ('dette', 'T', 'M', 1, '2025-06-15', 'x', 1)`,
		code: 'exercice_cloture'
	},
	creance_verrou_anterieure_maj: {
		permis: `UPDATE creance_dette SET motif = 'Ok' WHERE id = 2`,
		refuse: `UPDATE creance_dette SET date = '2025-06-15' WHERE id = 2`,
		code: 'exercice_cloture'
	},
	creance_verrou_creation: {
		permis: `INSERT INTO creance_dette (sens, tiers, motif, montant_centimes, date, cree_le, cree_par) VALUES ('dette', 'T', 'M', 1, '2026-11-01', 'x', 1)`,
		refuse: `INSERT INTO creance_dette (sens, tiers, motif, montant_centimes, date, cree_le, cree_par) VALUES ('dette', 'T', 'M', 1, '2026-03-01', 'x', 1)`,
		code: 'exercice_cloture'
	},
	creance_verrou_maj: {
		permis: `UPDATE creance_dette SET note = 'annulable et soldable', annulee_le = 'x' WHERE id = 1;
		         UPDATE creance_dette SET motif = 'Ok' WHERE id = 2`,
		refuse: `UPDATE creance_dette SET montant_centimes = 1 WHERE id = 1`,
		code: 'exercice_cloture'
	},
	reglement_verrou_creation: {
		permis: `INSERT INTO reglement (creance_dette_id, operation_id, montant_centimes) VALUES (1, 2, 100)`,
		refuse: `INSERT INTO reglement (creance_dette_id, operation_id, montant_centimes) VALUES (2, 1, 100)`,
		code: 'exercice_cloture'
	},
	reglement_verrou_maj: {
		permis: `UPDATE reglement SET montant_centimes = 50 WHERE id = 2`,
		refuse: `UPDATE reglement SET montant_centimes = 50 WHERE id = 1`,
		code: 'exercice_cloture'
	},
	reglement_verrou_suppr: {
		permis: `DELETE FROM reglement WHERE id = 2`,
		refuse: `DELETE FROM reglement WHERE id = 1`,
		code: 'exercice_cloture'
	},
	journal_sans_maj: {
		permis: `INSERT INTO journal_modification (horodatage, acces_nom, evenement, entite_type, resume) VALUES ('x', 'P', 'a.b', 'a', 'r')`,
		refuse: `INSERT INTO journal_modification (id, horodatage, acces_nom, evenement, entite_type, resume) VALUES (7, 'x', 'P', 'a.b', 'a', 'r');
		         UPDATE journal_modification SET resume = 'autre' WHERE id = 7`,
		code: 'journal_immuable'
	},
	journal_sans_suppression: {
		permis: `INSERT INTO journal_modification (horodatage, acces_nom, evenement, entite_type, resume) VALUES ('x', 'P', 'a.b', 'a', 'r')`,
		refuse: `INSERT INTO journal_modification (id, horodatage, acces_nom, evenement, entite_type, resume) VALUES (7, 'x', 'P', 'a.b', 'a', 'r');
		         DELETE FROM journal_modification WHERE id = 7`,
		code: 'journal_immuable'
	}
};

describe('triggers de 0001', () => {
	it('chaque trigger a son cas', () => {
		const presents = base
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
			.pluck()
			.all() as string[];
		// Ceux des jalons 2 et 3 ont leurs cas dans triggers-0003.test.ts et triggers-0004.test.ts.
		const deCeFichier = presents.filter(
			(n) => !/^(comptage|coupure)_verrou_|^facture_|^creance_retablir_/.test(n)
		);
		expect(Object.keys(cas).sort()).toEqual(deCeFichier);
	});

	for (const [nom, { permis, refuse, code }] of Object.entries(cas)) {
		describe(nom, () => {
			it('laisse passer le cas permis', () => {
				expect(() => base.exec(permis)).not.toThrow();
			});
			it(`refuse avec ${code}`, () => {
				refus(refuse, code);
			});
		});
	}

	it('ne protège pas liaison_id, sans_piece ni version après clôture (AD-5)', () => {
		base.exec(
			`INSERT INTO liaison (id, type, libelle) VALUES (1, 'paiement_multiple', 'Spectacle')`
		);
		expect(() =>
			base.exec(`UPDATE operation SET liaison_id = 1, sans_piece = 1, version = 2 WHERE id = 1`)
		).not.toThrow();
	});
});

describe('traduireErreurSqlite', () => {
	it('laisse une panne remonter comme exception', () => {
		expect(traduireErreurSqlite(new Error('disque plein'))).toBeNull();
		let erreur: unknown;
		try {
			base.exec(`UPDATE compte SET ordre = 'x' WHERE inconnue = 1`);
		} catch (e) {
			erreur = e;
		}
		expect(traduireErreurSqlite(erreur)).toBeNull();
	});

	it('traduit une unicité', () => {
		let erreur: unknown;
		try {
			base.exec(`INSERT INTO compte (libelle, type) VALUES ('ccp', 'banque')`);
		} catch (e) {
			erreur = e;
		}
		expect(traduireErreurSqlite(erreur)).toEqual({
			code: 'deja_utilise',
			details: { colonne: 'compte.libelle' }
		});
	});
});
