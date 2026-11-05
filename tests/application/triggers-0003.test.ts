import { beforeEach, describe, expect, it } from 'vitest';
import type { Base } from '#lib/server/infra/sqlite/connexion.ts';
import { traduireErreurSqlite } from '#lib/server/infra/sqlite/erreurs.ts';
import { baseAvecCloture } from './aides/base.ts';

let base: Base;

const SAISI = `'2026-10-05T18:00:00.000Z', '2026-10-05T18:00:00.000Z', 1`;

beforeEach(() => {
	base = baseAvecCloture();
	// Figé avant que l'Exercice 1 ne se clôture : on le rouvre le temps de poser les Comptages.
	base.exec(`
		INSERT INTO compte (id, libelle, type) VALUES (5, 'Réserve', 'caisse');
		DROP TRIGGER comptage_verrou_creation;
		DROP TRIGGER coupure_verrou_creation;
		INSERT INTO comptage (id, compte_id, type, date, compte_le, saisi_le, saisi_par) VALUES
			(1, 5, 'controle', '2026-06-01', ${SAISI}),
			(2, 5, 'controle', '2026-10-05', ${SAISI});
		INSERT INTO comptage_coupure (comptage_id, coupure_centimes, quantite) VALUES
			(1, 2000, 1), (2, 2000, 1);
		CREATE TRIGGER comptage_verrou_creation BEFORE INSERT ON comptage
		WHEN EXISTS (SELECT 1 FROM exercice e WHERE e.statut = 'cloture' AND NEW.date BETWEEN e.debut AND e.fin)
		BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
		CREATE TRIGGER coupure_verrou_creation BEFORE INSERT ON comptage_coupure
		WHEN EXISTS (SELECT 1 FROM comptage c JOIN exercice e ON e.statut = 'cloture'
		             WHERE c.id = NEW.comptage_id AND c.date BETWEEN e.debut AND e.fin)
		BEGIN SELECT RAISE(ABORT, 'exercice_cloture'); END;
	`);
});

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

const CAS: Record<string, { permis: string; refuse: string }> = {
	comptage_verrou_creation: {
		permis: `INSERT INTO comptage (compte_id, type, date, compte_le, saisi_le, saisi_par)
			VALUES (5, 'controle', '2026-10-06', ${SAISI})`,
		refuse: `INSERT INTO comptage (compte_id, type, date, compte_le, saisi_le, saisi_par)
			VALUES (5, 'controle', '2026-06-02', ${SAISI})`
	},
	comptage_verrou_maj: {
		permis: `UPDATE comptage SET date = '2026-10-06' WHERE id = 2`,
		refuse: `UPDATE comptage SET date = '2026-06-02' WHERE id = 1`
	},
	comptage_verrou_suppr: {
		permis: `DELETE FROM comptage WHERE id = 2`,
		refuse: `DELETE FROM comptage WHERE id = 1`
	},
	coupure_verrou_creation: {
		permis: `INSERT INTO comptage_coupure VALUES (2, 500, 2)`,
		refuse: `INSERT INTO comptage_coupure VALUES (1, 500, 2)`
	},
	coupure_verrou_maj: {
		permis: `UPDATE comptage_coupure SET quantite = 3 WHERE comptage_id = 2`,
		refuse: `UPDATE comptage_coupure SET quantite = 3 WHERE comptage_id = 1`
	},
	coupure_verrou_suppr: {
		permis: `DELETE FROM comptage_coupure WHERE comptage_id = 2`,
		refuse: `DELETE FROM comptage_coupure WHERE comptage_id = 1`
	}
};

describe('triggers de 0003', () => {
	it('chaque trigger a son cas', () => {
		const presents = base
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'trigger'
				 AND (name LIKE 'comptage_verrou_%' OR name LIKE 'coupure_verrou_%') ORDER BY name`
			)
			.pluck()
			.all();
		expect(Object.keys(CAS).sort()).toEqual(presents);
	});

	for (const [nom, { permis, refuse }] of Object.entries(CAS)) {
		it(`${nom} : refuse dans un Exercice clôturé, laisse passer ailleurs`, () => {
			expect(() => base.exec(permis)).not.toThrow();
			refus(refuse, 'exercice_cloture');
		});
	}
});
