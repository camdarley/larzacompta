import type {
	CompteurFacture,
	EntreeFacture,
	Facture,
	IdentiteFacture,
	LigneFacture,
	TypeFacture
} from '#lib/domaine/factures/index.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { DepotFactures } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type FactureBrute = {
	id: number;
	type: TypeFacture;
	numero: string | null;
	avoir_de_id: number | null;
	tiers_nom: string;
	tiers_adresse: string;
	date_emission: string | null;
	action_id: number | null;
	identite_figee_json: string | null;
	fichier_sha256: string | null;
	valide_le: string | null;
	cree_le: string;
};

type LigneBrute = {
	facture_id: number;
	designation: string;
	quantite: number;
	prix_unitaire_centimes: number;
};

type CompteurBrut = { annee: number; dernier: number; derniere_date: string };

const versLigne = (l: LigneBrute): LigneFacture => ({
	designation: l.designation,
	quantite: l.quantite,
	prixUnitaire: centimes(l.prix_unitaire_centimes)
});

const versFacture = (f: FactureBrute, lignes: LigneFacture[]): Facture => ({
	id: f.id,
	type: f.type,
	numero: f.numero,
	avoirDeId: f.avoir_de_id,
	tiersNom: f.tiers_nom,
	tiersAdresse: f.tiers_adresse,
	dateEmission: f.date_emission,
	actionId: f.action_id,
	identite:
		f.identite_figee_json === null ? null : (JSON.parse(f.identite_figee_json) as IdentiteFacture),
	fichierSha256: f.fichier_sha256,
	valideLe: f.valide_le,
	creeLe: f.cree_le,
	lignes
});

/** Seul chemin vers `facture`, `facture_ligne` et `compteur_facture` (AD-7). */
export function creerDepotFactures(base: Base): DepotFactures {
	const r = {
		toutes: base.prepare('SELECT * FROM facture ORDER BY id'),
		lignes: base.prepare(
			'SELECT facture_id, designation, quantite, prix_unitaire_centimes FROM facture_ligne ORDER BY facture_id, ordre'
		),
		une: base.prepare('SELECT * FROM facture WHERE id = ?'),
		lignesDe: base.prepare(
			'SELECT facture_id, designation, quantite, prix_unitaire_centimes FROM facture_ligne WHERE facture_id = ? ORDER BY ordre'
		),
		creer: base.prepare(`
			INSERT INTO facture (type, tiers_nom, tiers_adresse, date_emission, action_id, cree_le)
			VALUES ('facture', @tiersNom, @tiersAdresse, @dateEmission, @actionId, @creeLe)
		`),
		modifier: base.prepare(`
			UPDATE facture SET tiers_nom = @tiersNom, tiers_adresse = @tiersAdresse,
				date_emission = @dateEmission, action_id = @actionId
			WHERE id = @id
		`),
		supprimer: base.prepare('DELETE FROM facture WHERE id = ?'),
		viderLignes: base.prepare('DELETE FROM facture_ligne WHERE facture_id = ?'),
		ajouterLigne: base.prepare(`
			INSERT INTO facture_ligne (facture_id, ordre, designation, quantite, prix_unitaire_centimes)
			VALUES (?, ?, ?, ?, ?)
		`),
		compteurs: base.prepare('SELECT annee, dernier, derniere_date FROM compteur_facture'),
		avancer: base.prepare(`
			INSERT INTO compteur_facture (annee, dernier, derniere_date) VALUES (?, ?, ?)
			ON CONFLICT (annee) DO UPDATE SET
				dernier = excluded.dernier, derniere_date = excluded.derniere_date
		`),
		valider: base.prepare(`
			UPDATE facture SET numero = @numero, date_emission = @dateEmission,
				identite_figee_json = @identiteJson, fichier_sha256 = @fichierSha256,
				valide_le = @valideLe, valide_par = @validePar
			WHERE id = @id
		`),
		creerAvoir: base.prepare(`
			INSERT INTO facture (type, avoir_de_id, tiers_nom, tiers_adresse, date_emission, action_id, cree_le)
			VALUES ('avoir', @factureId, @tiersNom, @tiersAdresse, @dateEmission, @actionId, @valideLe)
		`),
		fichiers: base.prepare('SELECT fichier_sha256 FROM facture WHERE fichier_sha256 IS NOT NULL')
	};

	function ecrireLignes(id: number, lignes: readonly LigneFacture[]) {
		lignes.forEach((l, i) => {
			r.ajouterLigne.run(id, i + 1, l.designation, l.quantite, l.prixUnitaire);
		});
	}

	const valider: DepotFactures['valider'] = (id, v) => {
		r.valider.run({ ...v, id, identiteJson: JSON.stringify(v.identite) });
	};

	return {
		lister() {
			const lignes = new Map<number, LigneFacture[]>();
			for (const l of r.lignes.all() as LigneBrute[]) {
				lignes.set(l.facture_id, [...(lignes.get(l.facture_id) ?? []), versLigne(l)]);
			}
			return (r.toutes.all() as FactureBrute[]).map((f) => versFacture(f, lignes.get(f.id) ?? []));
		},

		parId(id) {
			const f = r.une.get(id) as FactureBrute | undefined;
			if (f === undefined) return null;
			return versFacture(f, (r.lignesDe.all(id) as LigneBrute[]).map(versLigne));
		},

		creer(e: EntreeFacture, creeLe) {
			const id = Number(r.creer.run({ ...e, creeLe }).lastInsertRowid);
			ecrireLignes(id, e.lignes);
			return id;
		},

		modifier(id, e) {
			r.modifier.run({ ...e, id });
			r.viderLignes.run(id);
			ecrireLignes(id, e.lignes);
		},

		supprimer(id) {
			r.viderLignes.run(id);
			r.supprimer.run(id);
		},

		compteurs: () =>
			(r.compteurs.all() as CompteurBrut[]).map((c): CompteurFacture => ({
				annee: c.annee,
				dernier: c.dernier,
				derniereDate: c.derniere_date
			})),

		avancerCompteur: (annee, dernier, derniereDate) =>
			void r.avancer.run(annee, dernier, derniereDate),

		valider,

		creerAvoir(factureId, e, v) {
			const id = Number(r.creerAvoir.run({ ...e, ...v, factureId }).lastInsertRowid);
			// Ses lignes s'écrivent avant le gel : un trigger refuse tout ajout à un document validé.
			ecrireLignes(id, e.lignes);
			valider(id, { ...v, dateEmission: e.dateEmission });
			return id;
		},

		fichiers: () => r.fichiers.pluck().all() as string[]
	};
}
