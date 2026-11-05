import { beforeEach, describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import { banc, type Banc } from './aides/app.ts';

let b: Banc;
let p: Banc['app']['parametrage'];
let e: Banc['app']['exercices'];

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

const ape = {
	nom: 'APE des Tilleuls',
	adresse: '1 rue fictive',
	moisDebutExercice: 9,
	mentionsFacture: ''
};

beforeEach(() => {
	b = banc();
	p = b.app.parametrage;
	e = b.app.exercices;
});

const pret = () => valeur(p.enregistrerAssociation(b.ctx(), ape));
const groupe = (libelle: string) =>
	valeur(p.groupes(b.ctx())).find((g) => g.libelle === libelle)?.id as number;

describe('association', () => {
	it('enregistre, puis modifie, avec une phrase claire au Journal', () => {
		pret();
		expect(p.association()?.nom).toBe('APE des Tilleuls');
		valeur(p.enregistrerAssociation(b.ctx(), { ...ape, nom: 'APE des Marronniers' }));
		expect(p.association()?.nom).toBe('APE des Marronniers');
		expect(b.journal().map((j) => j.evenement)).toEqual([
			'association.creee',
			'association.modifiee'
		]);
		expect(b.journal().at(-1)?.resume).toBe('a modifié l’identité de l’APE.');
	});

	it('pose les Groupes par défaut et les Natures système dès la création', () => {
		pret();
		expect(valeur(p.groupes(b.ctx())).map((g) => g.libelle)).toEqual([
			'Évènements',
			'Subventions',
			'Produits financiers',
			'Fonctionnement',
			'Communes',
			'Élémentaire',
			'Maternelle'
		]);
		const natures = valeur(p.natures(b.ctx()));
		expect(natures.map((n) => n.codeSysteme).sort()).toEqual([
			'ajustement',
			'ecart_caisse',
			'recette_especes',
			'somme_a_rendre'
		]);
		expect(natures.find((n) => n.codeSysteme === 'somme_a_rendre')?.neutre).toBe(true);
		expect(new Set(natures.map((n) => n.groupeId)).size).toBe(1);
	});

	it('refuse sans le droit de paramétrer', () => {
		const r = p.enregistrerAssociation(b.app.ctx({ ...b.tresorier, role: 'lecteur' }), ape);
		expect(!r.ok && r.erreur.code).toBe('acces_refuse');
		expect(p.comptes(b.app.ctx({ ...b.tresorier, role: 'lecteur' })).ok).toBe(false);
	});
});

describe('Comptes', () => {
	const ccp = { libelle: 'CCP', type: 'banque' as const };

	it('apparaissent dans l’ordre défini', () => {
		const a = valeur(p.creerCompte(b.ctx(), ccp));
		valeur(p.creerCompte(b.ctx(), { libelle: 'Livret', type: 'epargne' }));
		const c = valeur(p.creerCompte(b.ctx(), { libelle: 'Caisse', type: 'caisse' }));
		valeur(p.deplacerCompte(b.ctx(), c, 'monter'));
		expect(valeur(p.comptes(b.ctx())).map((x) => x.libelle)).toEqual(['CCP', 'Caisse', 'Livret']);
		valeur(p.deplacerCompte(b.ctx(), a, 'descendre'));
		expect(valeur(p.comptes(b.ctx())).map((x) => x.libelle)).toEqual(['Caisse', 'CCP', 'Livret']);
	});

	it('refusent un libellé déjà utilisé, à la casse près', () => {
		valeur(p.creerCompte(b.ctx(), ccp));
		const r = p.creerCompte(b.ctx(), { libelle: 'ccp', type: 'epargne' });
		expect(!r.ok && r.erreur).toEqual({
			code: 'libelle_deja_utilise',
			details: { champ: 'libelle' }
		});
	});

	it('se suppriment seulement s’ils n’ont jamais servi', () => {
		const id = valeur(p.creerCompte(b.ctx(), ccp));
		valeur(p.supprimerCompte(b.ctx(), id));
		expect(valeur(p.comptes(b.ctx()))).toEqual([]);
		expect(b.journal().at(-1)?.evenement).toBe('compte.supprime');
	});

	it('avec une ancre, se désactivent sans se supprimer', () => {
		pret();
		const ex = valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		const id = valeur(
			p.creerCompte(b.ctx(), { ...ccp, ancre: { exerciceId: ex.id, solde: centimes(120000) } })
		);
		const compte = valeur(p.comptes(b.ctx()))[0];
		expect(compte?.utilise).toBe(true);
		expect(compte?.ancre?.solde).toBe(120000);
		const r = p.supprimerCompte(b.ctx(), id);
		expect(!r.ok && r.erreur.code).toBe('element_utilise');
		// Il porte encore de l'argent : le désactiver ferait taire le Tableau de contrôle.
		const non = p.activerCompte(b.ctx(), id, false);
		expect(!non.ok && non.erreur.code).toBe('compte_non_vide');
		const vide = valeur(
			p.creerCompte(b.ctx(), {
				libelle: 'Livret vide',
				type: 'epargne',
				ancre: { exerciceId: ex.id, solde: centimes(0) }
			})
		);
		valeur(p.activerCompte(b.ctx(), vide, false));
		expect(valeur(p.comptes(b.ctx())).find((c) => c.id === vide)?.actif).toBe(false);
		valeur(p.activerCompte(b.ctx(), vide, true));
		expect(valeur(p.comptes(b.ctx())).find((c) => c.id === vide)?.actif).toBe(true);
	});

	it('avec un Côté, se désactivent sans se supprimer', () => {
		const id = valeur(p.creerCompte(b.ctx(), ccp));
		b.base.exec(`
			INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut)
				VALUES (9, '2026-2027', 2026, '2026-09-01', '2027-08-31', 'ouvert');
			INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par)
				VALUES (1, 'interne', '2026-10-01', 'Test', 'x', 1);
			INSERT INTO cote (operation_id, compte_id, date, montant_centimes)
				VALUES (1, ${id}, '2026-10-01', 100);
		`);
		const r = p.supprimerCompte(b.ctx(), id);
		expect(!r.ok && r.erreur.code).toBe('element_utilise');
	});

	it('gardent leur type dès qu’ils servent', () => {
		pret();
		const ex = valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		const id = valeur(
			p.creerCompte(b.ctx(), { ...ccp, ancre: { exerciceId: ex.id, solde: centimes(1) } })
		);
		valeur(p.modifierCompte(b.ctx(), { id, libelle: 'Compte courant', type: 'caisse' }));
		const c = valeur(p.comptes(b.ctx()))[0];
		expect(c?.libelle).toBe('Compte courant');
		expect(c?.type).toBe('banque');
		expect(b.journal().find((j) => j.evenement === 'compte.modifie')?.resume).toBe(
			'a renommé le Compte CCP en Compte courant.'
		);
	});

	it('écrivent leurs évènements en entite.verbe', () => {
		const id = valeur(p.creerCompte(b.ctx(), ccp));
		valeur(p.activerCompte(b.ctx(), id, false));
		for (const j of b.journal()) expect(j.evenement).toMatch(/^[a-z_]+\.[a-z_]+$/);
	});
});

describe('Natures, Actions, Groupes', () => {
	beforeEach(pret);

	it('chaque Nature et chaque Action a un Groupe existant', () => {
		const r = p.creerNature(b.ctx(), { libelle: 'Transport', groupeId: 999, neutre: false });
		expect(!r.ok && r.erreur.code).toBe('element_introuvable');
		const a = p.creerAction(b.ctx(), { libelle: 'Kermesse', groupeId: 999, avecCaisse: true });
		expect(!a.ok && a.erreur.code).toBe('element_introuvable');
	});

	it('une Action se marque avec caisse, se renomme, se désactive', () => {
		const id = valeur(
			p.creerAction(b.ctx(), {
				libelle: 'Kermesse',
				groupeId: groupe('Évènements'),
				avecCaisse: true
			})
		);
		expect(valeur(p.actions(b.ctx()))[0]?.avecCaisse).toBe(true);
		valeur(
			p.modifierAction(b.ctx(), {
				id,
				libelle: 'Fête',
				groupeId: groupe('Évènements'),
				avecCaisse: false
			})
		);
		valeur(p.activerAction(b.ctx(), id, false));
		expect(valeur(p.actions(b.ctx()))[0]).toMatchObject({
			libelle: 'Fête',
			avecCaisse: false,
			actif: false
		});
	});

	it('une Nature système ne se supprime, ne se renomme, ni ne se désactive', () => {
		const n = valeur(p.natures(b.ctx())).find((x) => x.codeSysteme === 'ecart_caisse');
		const id = n?.id as number;
		for (const r of [
			p.supprimerNature(b.ctx(), id),
			p.activerNature(b.ctx(), id, false),
			p.modifierNature(b.ctx(), {
				id,
				libelle: 'Autre',
				groupeId: groupe('Fonctionnement'),
				neutre: false
			})
		]) {
			expect(!r.ok && r.erreur.code).toBe('element_systeme');
		}
	});

	it('une Nature utilisée se désactive sans se supprimer', () => {
		const id = valeur(
			p.creerNature(b.ctx(), {
				libelle: 'Transport',
				groupeId: groupe('Fonctionnement'),
				neutre: false
			})
		);
		b.base.exec(`
			INSERT INTO exercice (id, libelle, annee_debut, debut, fin, statut)
				VALUES (9, '2026-2027', 2026, '2026-09-01', '2027-08-31', 'ouvert');
			INSERT INTO operation (id, genre, date, libelle, cree_le, cree_par)
				VALUES (1, 'standard', '2026-10-01', 'Test', 'x', 1);
			INSERT INTO ligne (operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id)
				VALUES (1, 1, -100, ${id}, 9);
		`);
		const r = p.supprimerNature(b.ctx(), id);
		expect(!r.ok && r.erreur.code).toBe('element_utilise');
		valeur(p.activerNature(b.ctx(), id, false));
		expect(valeur(p.natures(b.ctx())).find((n) => n.id === id)?.actif).toBe(false);
	});

	it('une Nature ou une Action jamais utilisée se supprime', () => {
		const n = valeur(
			p.creerNature(b.ctx(), {
				libelle: 'Transport',
				groupeId: groupe('Fonctionnement'),
				neutre: false
			})
		);
		const a = valeur(
			p.creerAction(b.ctx(), {
				libelle: 'Kermesse',
				groupeId: groupe('Évènements'),
				avecCaisse: false
			})
		);
		valeur(p.supprimerNature(b.ctx(), n));
		valeur(p.supprimerAction(b.ctx(), a));
		expect(valeur(p.actions(b.ctx()))).toEqual([]);
	});

	it('l’ordre des Groupes change, et un Groupe vide se supprime', () => {
		const id = valeur(p.creerGroupe(b.ctx(), 'Divers'));
		valeur(p.deplacerGroupe(b.ctx(), id, 'monter'));
		const noms = valeur(p.groupes(b.ctx())).map((g) => g.libelle);
		expect(noms.at(-1)).toBe('Maternelle');
		expect(noms.at(-2)).toBe('Divers');
		valeur(p.renommerGroupe(b.ctx(), id, 'Autres'));
		valeur(p.supprimerGroupe(b.ctx(), id));
		expect(valeur(p.groupes(b.ctx())).map((g) => g.libelle)).not.toContain('Autres');
		const occupe = p.supprimerGroupe(b.ctx(), groupe('Fonctionnement'));
		expect(!occupe.ok && occupe.erreur.code).toBe('groupe_utilise');
	});

	it('refuse un libellé pris', () => {
		const r = p.creerGroupe(b.ctx(), 'fonctionnement');
		expect(!r.ok && r.erreur.code).toBe('libelle_deja_utilise');
	});
});

describe('liste type', () => {
	beforeEach(pret);

	it('ne crée que ce qui est coché, en plus des Natures système', () => {
		const r = valeur(
			p.appliquerListeType(b.ctx(), { natures: ['Transport'], actions: ['Kermesse'] })
		);
		expect(r).toEqual({ natures: 1, actions: 1 });
		const natures = valeur(p.natures(b.ctx()));
		expect(natures).toHaveLength(5);
		expect(natures.find((n) => n.libelle === 'Transport')?.codeSysteme).toBeNull();
		expect(valeur(p.actions(b.ctx())).map((a) => a.libelle)).toEqual(['Kermesse']);
		expect(valeur(p.actions(b.ctx()))[0]?.avecCaisse).toBe(true);
	});

	it('tout décoché : les Natures système et leur Groupe restent', () => {
		valeur(p.appliquerListeType(b.ctx(), { natures: [], actions: [] }));
		expect(
			valeur(p.natures(b.ctx()))
				.map((n) => n.codeSysteme)
				.sort()
		).toEqual(['ajustement', 'ecart_caisse', 'recette_especes', 'somme_a_rendre']);
		expect(valeur(p.groupes(b.ctx())).map((g) => g.libelle)).toContain('Fonctionnement');
	});

	it('s’applique deux fois sans doublon, et ignore l’inconnu', () => {
		valeur(p.appliquerListeType(b.ctx(), { natures: ['Transport', 'Inconnue'], actions: [] }));
		const r = valeur(p.appliquerListeType(b.ctx(), { natures: ['Transport'], actions: [] }));
		expect(r.natures).toBe(0);
	});

	it('exige une APE décrite', () => {
		const vide = banc();
		const r = vide.app.parametrage.appliquerListeType(vide.ctx(), { natures: [], actions: [] });
		expect(!r.ok && r.erreur.code).toBe('association_absente');
	});
});
