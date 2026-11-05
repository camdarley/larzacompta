import type { ReglageCsv } from '#lib/domaine/releve/csv.ts';
import type { DepotPointage } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

/** Seul chemin vers `import_releve`, `ligne_releve`, `constat_solde`, `pointage` et `profil_csv`. */
export function creerDepotPointage(base: Base): DepotPointage {
	const r = {
		periodes: base.prepare(`
			SELECT id, date_min, date_max FROM import_releve
			WHERE compte_id = ? AND date_min IS NOT NULL AND date_max IS NOT NULL
			ORDER BY id
		`),
		creerImport: base.prepare(`
			INSERT INTO import_releve
				(compte_id, source, nom_fichier, compte_source, fichier_sha256, date_min, date_max,
				 nb_lues, nb_nouvelles, nb_connues, importe_le, importe_par)
			VALUES
				(@compteId, @source, @nomFichier, @compteSource, @fichierSha256, @dateMin, @dateMax,
				 @lues, @nouvelles, @connues, @importeLe, @importePar)
		`),
		dernierCompteSource: base
			.prepare(
				`
				SELECT compte_source FROM import_releve
				WHERE compte_id = ? AND compte_source IS NOT NULL
				ORDER BY id DESC LIMIT 1
			`
			)
			.pluck(),
		fichiersReleves: base
			.prepare('SELECT fichier_sha256 FROM import_releve WHERE fichier_sha256 IS NOT NULL')
			.pluck(),
		creerLigne: base.prepare(`
			INSERT INTO ligne_releve
				(compte_id, import_id, date, montant_centimes, libelle, identifiant_source, empreinte, doublon, cree_le)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`),
		confirmerLigne: base.prepare(`UPDATE ligne_releve SET doublon = 'confirme' WHERE id = ?`),
		supprimerLigne: base.prepare('DELETE FROM ligne_releve WHERE id = ?'),
		creerConstat: base.prepare(`
			INSERT INTO constat_solde (compte_id, date, solde_centimes, source, import_id, cree_le, cree_par)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`),
		creerPointage: base.prepare(
			'INSERT INTO pointage (compte_id, cree_le, cree_par) VALUES (?, ?, ?)'
		),
		pointageCote: base.prepare('INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (?, ?)'),
		pointageLigne: base.prepare(
			'INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (?, ?)'
		),
		supprimerPointage: base.prepare('DELETE FROM pointage WHERE id = ?'),
		profil: base.prepare('SELECT reglage_json FROM profil_csv WHERE compte_id = ?').pluck(),
		ecrireProfil: base.prepare(`
			INSERT INTO profil_csv (compte_id, reglage_json) VALUES (?, ?)
			ON CONFLICT (compte_id) DO UPDATE SET reglage_json = excluded.reglage_json
		`)
	};

	return {
		periodes: (compteId) =>
			(r.periodes.all(compteId) as { id: number; date_min: string; date_max: string }[]).map(
				(p) => ({ id: p.id, dateMin: p.date_min, dateMax: p.date_max })
			),

		creerImport: (i) => Number(r.creerImport.run(i).lastInsertRowid),
		dernierCompteSource: (compteId) =>
			(r.dernierCompteSource.get(compteId) as string | undefined) ?? null,

		fichiersReleves: () => r.fichiersReleves.all() as string[],

		creerLigne: (l) =>
			Number(
				r.creerLigne.run(
					l.compteId,
					l.importId,
					l.date,
					l.montant,
					l.libelle,
					l.identifiant,
					l.empreinte,
					l.doublon,
					l.creeLe
				).lastInsertRowid
			),

		confirmerLigne: (id) => void r.confirmerLigne.run(id),
		supprimerLigne: (id) => void r.supprimerLigne.run(id),

		creerConstat: (c) =>
			Number(
				r.creerConstat.run(c.compteId, c.date, c.solde, c.source, c.importId, c.creeLe, c.creePar)
					.lastInsertRowid
			),

		creerPointage(p) {
			const id = Number(r.creerPointage.run(p.compteId, p.creeLe, p.creePar).lastInsertRowid);
			for (const c of p.coteIds) r.pointageCote.run(id, c);
			for (const l of p.ligneIds) r.pointageLigne.run(id, l);
			return id;
		},

		supprimerPointage: (id) => void r.supprimerPointage.run(id),

		profil(compteId) {
			const brut = r.profil.get(compteId) as string | undefined;
			return brut === undefined ? null : (JSON.parse(brut) as ReglageCsv);
		},

		ecrireProfil: (compteId, reglage) => void r.ecrireProfil.run(compteId, JSON.stringify(reglage))
	};
}
