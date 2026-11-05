import { beforeEach, describe, expect, it } from 'vitest';
import type { Base } from '#lib/server/infra/sqlite/connexion.ts';
import { traduireErreurSqlite } from '#lib/server/infra/sqlite/erreurs.ts';
import { baseAvecCloture, baseMigree } from './aides/base.ts';

let base: Base;

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

beforeEach(() => {
	base = baseMigree();
	base.exec(`
		INSERT INTO facture (id, type, tiers_nom, cree_le) VALUES (1, 'facture', 'Brouillon fictif', 'x');
		INSERT INTO facture (id, type, numero, tiers_nom, valide_le, cree_le)
			VALUES (2, 'facture', '2026-001', 'Validée fictive', '2026-11-01', 'x');
		INSERT INTO facture_ligne (id, facture_id, ordre, designation, prix_unitaire_centimes)
			VALUES (1, 1, 1, 'Repas', 100);
	`);
	// La ligne d'une Facture validée s'écrit avant le gel : le trigger la refuserait, c'est son rôle.
	base.exec(`
		DROP TRIGGER facture_ligne_fige_creation;
		INSERT INTO facture_ligne (id, facture_id, ordre, designation, prix_unitaire_centimes)
			VALUES (2, 2, 1, 'Repas', 100);
		CREATE TRIGGER facture_ligne_fige_creation BEFORE INSERT ON facture_ligne
		WHEN EXISTS (SELECT 1 FROM facture f WHERE f.id = NEW.facture_id AND f.valide_le IS NOT NULL)
		BEGIN SELECT RAISE(ABORT, 'facture_validee'); END;
	`);
});

const CAS: Record<string, { permis: string; refuse: string }> = {
	facture_validee_fige: {
		permis: `UPDATE facture SET tiers_nom = 'Autre' WHERE id = 1`,
		refuse: `UPDATE facture SET tiers_nom = 'Autre' WHERE id = 2`
	},
	facture_validee_sans_suppression: {
		permis: `DELETE FROM facture_ligne WHERE facture_id = 1; DELETE FROM facture WHERE id = 1`,
		refuse: `DELETE FROM facture WHERE id = 2`
	},
	facture_ligne_fige_creation: {
		permis: `INSERT INTO facture_ligne (facture_id, ordre, designation, prix_unitaire_centimes) VALUES (1, 2, 'A', 1)`,
		refuse: `INSERT INTO facture_ligne (facture_id, ordre, designation, prix_unitaire_centimes) VALUES (2, 2, 'A', 1)`
	},
	facture_ligne_fige_maj: {
		permis: `UPDATE facture_ligne SET quantite = 2 WHERE id = 1`,
		refuse: `UPDATE facture_ligne SET quantite = 2 WHERE id = 2`
	},
	facture_ligne_fige_suppr: {
		permis: `DELETE FROM facture_ligne WHERE id = 1`,
		refuse: `DELETE FROM facture_ligne WHERE id = 2`
	}
};

describe('triggers de 0004', () => {
	it('chaque trigger a son cas', () => {
		const presents = base
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'facture%' ORDER BY name`
			)
			.pluck()
			.all();
		expect(Object.keys(CAS).sort()).toEqual(presents);
	});

	for (const [nom, { permis, refuse }] of Object.entries(CAS)) {
		describe(nom, () => {
			it('laisse passer le cas permis', () => {
				expect(() => base.exec(permis)).not.toThrow();
			});
			it('refuse avec facture_validee', () => {
				refus(refuse, 'facture_validee');
			});
		});
	}

	it('un numéro ne se répète pas, un brouillon n’en a pas', () => {
		expect(() =>
			base.exec(`INSERT INTO facture (type, tiers_nom, cree_le) VALUES ('facture', 'B', 'x')`)
		).not.toThrow();
		expect(() =>
			base.exec(`INSERT INTO facture (type, numero, tiers_nom, cree_le)
				VALUES ('facture', '2026-002', 'Sans validation', 'x')`)
		).toThrow(/CHECK/);
		expect(() =>
			base.exec(`INSERT INTO facture (type, numero, tiers_nom, valide_le, cree_le)
				VALUES ('facture', '2026-001', 'Doublon', 'x', 'x')`)
		).toThrow(/UNIQUE/);
	});

	it('un Avoir porte toujours sa Facture, et une seule fois', () => {
		expect(() =>
			base.exec(`INSERT INTO facture (type, tiers_nom, cree_le) VALUES ('avoir', 'A', 'x')`)
		).toThrow(/CHECK/);
		const avoir = `INSERT INTO facture (type, avoir_de_id, tiers_nom, cree_le) VALUES ('avoir', 2, 'A', 'x')`;
		base.exec(avoir);
		expect(() => base.exec(avoir)).toThrow(/UNIQUE/);
	});
});

describe('creance_retablir_verrou (FR-3)', () => {
	beforeEach(() => {
		base = baseAvecCloture();
	});

	const annulee = (id: number, le: string) =>
		base
			.prepare('UPDATE creance_dette SET annulee_le = ?, annulee_par = 1 WHERE id = ?')
			.run(le, id);

	it('refuse de rétablir une annulation qu’une clôture a vue', () => {
		annulee(1, '2026-03-01T10:00:00.000Z');
		refus(`UPDATE creance_dette SET annulee_le = NULL WHERE id = 1`, 'exercice_cloture');
	});

	it('laisse rétablir une annulation venue après la fin de l’Exercice', () => {
		annulee(1, '2026-10-20T10:00:00.000Z');
		expect(() =>
			base.exec(`UPDATE creance_dette SET annulee_le = NULL WHERE id = 1`)
		).not.toThrow();
	});
});
