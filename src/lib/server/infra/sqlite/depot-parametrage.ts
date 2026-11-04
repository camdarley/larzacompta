import { centimes } from '#lib/domaine/montant.ts';
import type {
	Action,
	Ancre,
	Association,
	CodeSysteme,
	Compte,
	Groupe,
	Nature,
	TypeCompte
} from '#lib/domaine/parametrage.ts';
import type { DepotParametrage } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type AssociationBrute = {
	nom: string;
	adresse: string;
	mois_debut_exercice: number;
	mentions_facture: string;
	etape_assistant: number;
};
type CompteBrut = {
	id: number;
	libelle: string;
	type: TypeCompte;
	reserve: number;
	ordre: number;
	actif: number;
};
type NatureBrute = {
	id: number;
	libelle: string;
	groupe_id: number;
	neutre: number;
	code_systeme: CodeSysteme | null;
	actif: number;
};
type ActionBrute = {
	id: number;
	libelle: string;
	groupe_id: number;
	avec_caisse: number;
	actif: number;
};
type AncreBrute = { compte_id: number; exercice_id: number; solde_centimes: number };

const versCompte = (c: CompteBrut): Compte => ({
	id: c.id,
	libelle: c.libelle,
	type: c.type,
	reserve: c.reserve === 1,
	ordre: c.ordre,
	actif: c.actif === 1
});

const versNature = (n: NatureBrute): Nature => ({
	id: n.id,
	libelle: n.libelle,
	groupeId: n.groupe_id,
	neutre: n.neutre === 1,
	codeSysteme: n.code_systeme,
	actif: n.actif === 1
});

const versAction = (a: ActionBrute): Action => ({
	id: a.id,
	libelle: a.libelle,
	groupeId: a.groupe_id,
	avecCaisse: a.avec_caisse === 1,
	actif: a.actif === 1
});

const versAncre = (a: AncreBrute): Ancre => ({
	compteId: a.compte_id,
	exerciceId: a.exercice_id,
	solde: centimes(a.solde_centimes)
});

export function creerDepotParametrage(base: Base): DepotParametrage {
	const r = {
		association: base.prepare('SELECT * FROM association WHERE id = 1'),
		ecrireAssociation: base.prepare(`
			INSERT INTO association (id, nom, adresse, mois_debut_exercice, mentions_facture)
			VALUES (1, @nom, @adresse, @moisDebutExercice, @mentionsFacture)
			ON CONFLICT (id) DO UPDATE SET
				nom = excluded.nom, adresse = excluded.adresse,
				mois_debut_exercice = excluded.mois_debut_exercice,
				mentions_facture = excluded.mentions_facture
		`),
		etape: base.prepare('UPDATE association SET etape_assistant = ? WHERE id = 1'),

		comptes: base.prepare('SELECT * FROM compte ORDER BY ordre, id'),
		creerCompte: base.prepare(
			'INSERT INTO compte (libelle, type, ordre) VALUES (@libelle, @type, @ordre)'
		),
		modifierCompte: base.prepare('UPDATE compte SET libelle = ?, type = ? WHERE id = ?'),
		ordreCompte: base.prepare('UPDATE compte SET ordre = ? WHERE id = ?'),
		actifCompte: base.prepare('UPDATE compte SET actif = ? WHERE id = ?'),
		supprimerCompte: base.prepare('DELETE FROM compte WHERE id = ?'),
		compteUtilise: base
			.prepare(
				`SELECT EXISTS (SELECT 1 FROM cote WHERE compte_id = @id)
				     OR EXISTS (SELECT 1 FROM balance_ouverture WHERE compte_id = @id)
				     OR EXISTS (SELECT 1 FROM ligne_releve WHERE compte_id = @id)
				     OR EXISTS (SELECT 1 FROM constat_solde WHERE compte_id = @id)`
			)
			.pluck(),

		groupes: base.prepare('SELECT id, libelle, ordre FROM groupe ORDER BY ordre, id'),
		creerGroupe: base.prepare('INSERT INTO groupe (libelle, ordre) VALUES (@libelle, @ordre)'),
		renommerGroupe: base.prepare('UPDATE groupe SET libelle = ? WHERE id = ?'),
		ordreGroupe: base.prepare('UPDATE groupe SET ordre = ? WHERE id = ?'),
		supprimerGroupe: base.prepare('DELETE FROM groupe WHERE id = ?'),
		groupeUtilise: base
			.prepare(
				`SELECT EXISTS (SELECT 1 FROM nature WHERE groupe_id = @id)
				     OR EXISTS (SELECT 1 FROM action WHERE groupe_id = @id)`
			)
			.pluck(),

		natures: base.prepare('SELECT * FROM nature ORDER BY libelle COLLATE NOCASE'),
		creerNature: base.prepare(`
			INSERT INTO nature (libelle, groupe_id, neutre, code_systeme)
			VALUES (@libelle, @groupeId, @neutre, @codeSysteme)
		`),
		modifierNature: base.prepare(
			'UPDATE nature SET libelle = ?, groupe_id = ?, neutre = ? WHERE id = ?'
		),
		actifNature: base.prepare('UPDATE nature SET actif = ? WHERE id = ?'),
		supprimerNature: base.prepare('DELETE FROM nature WHERE id = ?'),
		natureUtilisee: base.prepare('SELECT EXISTS (SELECT 1 FROM ligne WHERE nature_id = ?)').pluck(),

		actions: base.prepare('SELECT * FROM action ORDER BY libelle COLLATE NOCASE'),
		creerAction: base.prepare(`
			INSERT INTO action (libelle, groupe_id, avec_caisse) VALUES (@libelle, @groupeId, @avecCaisse)
		`),
		modifierAction: base.prepare(
			'UPDATE action SET libelle = ?, groupe_id = ?, avec_caisse = ? WHERE id = ?'
		),
		actifAction: base.prepare('UPDATE action SET actif = ? WHERE id = ?'),
		supprimerAction: base.prepare('DELETE FROM action WHERE id = ?'),
		actionUtilisee: base
			.prepare(
				`SELECT EXISTS (SELECT 1 FROM ligne WHERE action_id = @id)
				     OR EXISTS (SELECT 1 FROM creance_dette WHERE action_id = @id)`
			)
			.pluck(),

		ancres: base.prepare('SELECT * FROM balance_ouverture'),
		ecrireAncre: base.prepare(`
			INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, ?)
			ON CONFLICT (compte_id) DO UPDATE SET
				exercice_id = excluded.exercice_id, solde_centimes = excluded.solde_centimes
		`)
	};

	return {
		association() {
			const a = r.association.get() as AssociationBrute | undefined;
			if (a === undefined) return null;
			const association: Association = {
				nom: a.nom,
				adresse: a.adresse,
				moisDebutExercice: a.mois_debut_exercice,
				mentionsFacture: a.mentions_facture,
				etapeAssistant: a.etape_assistant
			};
			return association;
		},
		ecrireAssociation: (a) => void r.ecrireAssociation.run(a),
		definirEtapeAssistant: (etape) => void r.etape.run(etape),

		comptes: () => (r.comptes.all() as CompteBrut[]).map(versCompte),
		creerCompte: (c) => Number(r.creerCompte.run(c).lastInsertRowid),
		modifierCompte: (id, c) => void r.modifierCompte.run(c.libelle, c.type, id),
		definirOrdreCompte: (id, ordre) => void r.ordreCompte.run(ordre, id),
		activerCompte: (id, actif) => void r.actifCompte.run(actif ? 1 : 0, id),
		supprimerCompte: (id) => void r.supprimerCompte.run(id),
		compteUtilise: (id) => r.compteUtilise.get({ id }) === 1,

		groupes: () => r.groupes.all() as Groupe[],
		creerGroupe: (g) => Number(r.creerGroupe.run(g).lastInsertRowid),
		renommerGroupe: (id, libelle) => void r.renommerGroupe.run(libelle, id),
		definirOrdreGroupe: (id, ordre) => void r.ordreGroupe.run(ordre, id),
		supprimerGroupe: (id) => void r.supprimerGroupe.run(id),
		groupeUtilise: (id) => r.groupeUtilise.get({ id }) === 1,

		natures: () => (r.natures.all() as NatureBrute[]).map(versNature),
		creerNature: (n) =>
			Number(r.creerNature.run({ ...n, neutre: n.neutre ? 1 : 0 }).lastInsertRowid),
		modifierNature: (id, n) =>
			void r.modifierNature.run(n.libelle, n.groupeId, n.neutre ? 1 : 0, id),
		activerNature: (id, actif) => void r.actifNature.run(actif ? 1 : 0, id),
		supprimerNature: (id) => void r.supprimerNature.run(id),
		natureUtilisee: (id) => r.natureUtilisee.get(id) === 1,

		actions: () => (r.actions.all() as ActionBrute[]).map(versAction),
		creerAction: (a) =>
			Number(r.creerAction.run({ ...a, avecCaisse: a.avecCaisse ? 1 : 0 }).lastInsertRowid),
		modifierAction: (id, a) =>
			void r.modifierAction.run(a.libelle, a.groupeId, a.avecCaisse ? 1 : 0, id),
		activerAction: (id, actif) => void r.actifAction.run(actif ? 1 : 0, id),
		supprimerAction: (id) => void r.supprimerAction.run(id),
		actionUtilisee: (id) => r.actionUtilisee.get({ id }) === 1,

		ancres: () => (r.ancres.all() as AncreBrute[]).map(versAncre),
		ecrireAncre: (compteId, exerciceId, solde) =>
			void r.ecrireAncre.run(compteId, exerciceId, solde)
	};
}
