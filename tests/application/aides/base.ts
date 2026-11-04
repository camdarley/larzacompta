import { chargerMigrations, appliquerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';
import { ouvrirBase, type Base } from '#lib/server/infra/sqlite/connexion.ts';

export function baseMigree(): Base {
	const base = ouvrirBase(':memory:');
	appliquerMigrations(base, chargerMigrations('migrations'), {
		horodatage: '2026-11-04T10:00:00.000Z'
	});
	return base;
}

/** Deux Exercices : 2025-2026 clôturé, 2026-2027 ouvert, avec un Accès, un Compte, une Nature. */
export function baseAvecCloture(): Base {
	const base = baseMigree();
	base.exec(`
		INSERT INTO acces (id, identifiant, nom_affiche, role, cree_le)
			VALUES (1, 'test', 'Personne fictive', 'tresorier', '2025-09-01T08:00:00.000Z');
		INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut) VALUES
			(1, '2025-2026', 2025, '2025-09-01', '2026-08-31', 'ouvert'),
			(2, '2026-2027', 2026, '2026-09-01', '2027-08-31', 'ouvert');
		INSERT INTO groupe (id, libelle, ordre) VALUES (1, 'Fonctionnement', 1);
		INSERT INTO nature (id, libelle, groupe_id) VALUES (1, 'Transport', 1);
		INSERT INTO compte (id, libelle, type) VALUES (1, 'CCP', 'banque'), (2, 'Livret', 'epargne');
		INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (1, 1, 100000);
		INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (2, 2, 500000);

		-- Une Opération dans chaque Exercice, écrite avant la clôture.
		INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par) VALUES
			(1, 'standard', '2026-03-12', 'Autocars du Sud', '2026-03-12T18:00:00.000Z', 1),
			(2, 'standard', '2026-10-05', 'Papeterie fictive', '2026-10-05T18:00:00.000Z', 1);
		INSERT INTO cote (id, operation_id, compte_id, date, montant_centimes) VALUES
			(1, 1, 1, '2026-03-12', -10000),
			(2, 2, 1, '2026-10-05', -2000);
		INSERT INTO ligne (id, operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id) VALUES
			(1, 1, 1, -10000, 1, 1),
			(2, 2, 1, -2000, 1, 2);
		INSERT INTO constat_solde (id, compte_id, date, solde_centimes, source, cree_le, cree_par) VALUES
			(1, 1, '2026-06-30', 90000, 'saisie', '2026-06-30T18:00:00.000Z', 1),
			(2, 1, '2026-10-31', 88000, 'saisie', '2026-10-31T18:00:00.000Z', 1);
		INSERT INTO creance_dette (id, sens, tiers, motif, montant_centimes, date, cree_le, cree_par) VALUES
			(1, 'creance', 'Mairie fictive', 'Subvention', 50000, '2026-02-01', '2026-02-01T18:00:00.000Z', 1),
			(2, 'dette', 'Bénévole fictif', 'Remboursement', 3000, '2026-10-01', '2026-10-01T18:00:00.000Z', 1);
		INSERT INTO reglement (id, creance_dette_id, operation_id, montant_centimes) VALUES
			(1, 1, 1, 100),
			(2, 2, 2, 100);

		INSERT INTO ligne_releve (id, compte_id, date, montant_centimes, libelle, empreinte, cree_le) VALUES
			(1, 1, '2026-03-13', -10000, 'VIR AUTOCARS', 'e1', '2026-03-20T18:00:00.000Z'),
			(2, 1, '2026-10-06', -2000, 'CB PAPETERIE', 'e2', '2026-10-20T18:00:00.000Z');
		INSERT INTO pointage (id, compte_id, cree_le, cree_par) VALUES
			(1, 1, '2026-03-20T18:00:00.000Z', 1),
			(2, 1, '2026-10-20T18:00:00.000Z', 1);
		INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (1, 1);
		INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (1, 1);

		UPDATE exercice SET statut = 'cloture' WHERE id = 1;
		INSERT INTO cloture_exercice (exercice_id, cloture_le, cloture_par, parametrage_fige_json, empreinte_sha256)
			VALUES (1, '2026-10-01T18:00:00.000Z', 1, '{}', 'abc');
	`);
	return base;
}
