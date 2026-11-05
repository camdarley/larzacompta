import { beforeEach, describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import type { ReglageCsv } from '#lib/domaine/releve/csv.ts';
import { composer } from '#lib/server/composition.ts';
import { baseAvecCloture } from './aides/base.ts';
import { banc, type Banc } from './aides/app.ts';
import { sources } from '../projet/fichiers.ts';
import { LIGNES_FICTIVES, ofxCp1252, ofxTexte, type LigneOfx } from '../jeux/releve-fictif.ts';

const NOM = 'releve-fictif.ofx';
const utf8 = (t: string) => new TextEncoder().encode(t);
const c = centimes;

const REGLAGE: ReglageCsv = {
	date: 'Date',
	libelle: 'Libellé',
	identifiant: null,
	montant: { mode: 'unique', colonne: 'Montant' }
};

let b: Banc;
let ccp: number;
let livret: number;
let caisse: number;
let nature: number;

function preparer(s: Banc) {
	const ctx = s.ctx();
	const depots = s.app.socle.depots;
	depots.exercices.creer({
		libelle: '2026-2027',
		anneeDebut: 2026,
		debut: '2026-09-01',
		fin: '2027-08-31',
		statut: 'ouvert'
	});
	const exercice = depots.exercices.lister()[0];
	ccp = depots.parametrage.creerCompte({ libelle: 'CCP', type: 'banque', ordre: 1 });
	livret = depots.parametrage.creerCompte({ libelle: 'Livret', type: 'epargne', ordre: 2 });
	caisse = depots.parametrage.creerCompte({ libelle: 'Caisse', type: 'caisse', ordre: 3 });
	depots.parametrage.ecrireAncre(ccp, exercice?.id as number, c(100000));
	depots.parametrage.ecrireAncre(livret, exercice?.id as number, c(0));
	const groupe = depots.parametrage.creerGroupe({ libelle: 'Fonctionnement', ordre: 1 });
	nature = depots.parametrage.creerNature({
		libelle: 'Transport',
		groupeId: groupe,
		neutre: false,
		codeSysteme: null
	});
	depots.parametrage.creerNature({
		libelle: 'Ajustement',
		groupeId: groupe,
		neutre: false,
		codeSysteme: 'ajustement'
	});
	return ctx;
}

function importer(s: Banc, lignes: LigneOfx[], solde?: { montant: string; date: string } | null) {
	return s.app.pointage.importer(s.ctx(), {
		compteId: ccp,
		nomFichier: NOM,
		octets: ofxCp1252(ofxTexte(lignes, solde))
	});
}

function operation(
	s: Banc,
	o: {
		montant: number;
		libelle: string;
		date?: string;
		reference?: string | null;
		intention?: 'depense' | 'recette';
	}
) {
	const r = s.app.operations.creer(s.ctx(), {
		forme: 'standard',
		libelle: o.libelle,
		reference: o.reference ?? null,
		modePaiement: null,
		note: null,
		tiers: null,
		intention: o.intention ?? 'depense',
		compteId: ccp,
		date: o.date ?? '2026-10-05',
		montant: c(o.montant),
		lignes: [
			{
				montant: c(o.montant),
				contraire: false,
				reduction: false,
				natureId: nature,
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		]
	});
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur.id;
}

const compter = (s: Banc, table: string) =>
	(s.base.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const coteDe = (s: Banc, id: number) =>
	s.app.socle.depots.operations.parId(id)?.cotes[0]?.id as number;
const lignes = (s: Banc) => s.app.socle.depots.operations.journal().lignesReleve;

beforeEach(() => {
	b = banc();
	preparer(b);
});

describe('importer (story 3.2)', () => {
	it('écrit import_releve, lignes et Constat dans une transaction, et garde le fichier', () => {
		const r = importer(b, LIGNES_FICTIVES);
		expect(r).toMatchObject({
			ok: true,
			valeur: {
				type: 'recapitulatif',
				lues: 3,
				nouvelles: 3,
				connues: 0,
				aConfirmer: 0,
				soldeDemande: null
			}
		});
		expect(compter(b, 'import_releve')).toBe(1);
		expect(compter(b, 'ligne_releve')).toBe(3);
		expect(compter(b, 'constat_solde')).toBe(1);
		expect(b.fichiers.size).toBe(1);
		const imp = b.base.prepare('SELECT * FROM import_releve').get() as Record<string, unknown>;
		expect(imp).toMatchObject({
			source: 'ofx',
			nom_fichier: NOM,
			fichier_sha256: 'fichier-1',
			date_min: '2026-10-05',
			date_max: '2026-10-12',
			nb_lues: 3,
			nb_nouvelles: 3,
			nb_connues: 0
		});
		expect(b.journal().at(-1)).toMatchObject({
			evenement: 'releve.importe',
			resume: `a importé le relevé « ${NOM} » : 3 lignes nouvelles sur 3.`
		});
	});

	it('le même fichier importé deux fois n’ajoute rien, ni ligne, ni fichier, ni Journal', () => {
		importer(b, LIGNES_FICTIVES);
		const avant = b.journal().length;
		const r = importer(b, LIGNES_FICTIVES);
		expect(r).toMatchObject({ ok: true, valeur: { lues: 3, nouvelles: 0, connues: 3 } });
		expect(compter(b, 'ligne_releve')).toBe(3);
		expect(compter(b, 'import_releve')).toBe(1);
		expect(compter(b, 'constat_solde')).toBe(1);
		expect(b.fichiers.size).toBe(1);
		expect(b.journal()).toHaveLength(avant);
	});

	it('une fenêtre d’export qui glisse n’apporte que le neuf', () => {
		importer(b, LIGNES_FICTIVES.slice(0, 2));
		const r = importer(b, LIGNES_FICTIVES.slice(1));
		expect(r).toMatchObject({ ok: true, valeur: { nouvelles: 1, connues: 1 } });
		expect(compter(b, 'ligne_releve')).toBe(3);
	});

	it('un solde nouveau sans ligne nouvelle crée quand même son Constat', () => {
		importer(b, LIGNES_FICTIVES);
		const r = importer(b, LIGNES_FICTIVES, { montant: '1600.00', date: '20261021' });
		expect(r).toMatchObject({ ok: true, valeur: { nouvelles: 0 } });
		expect(compter(b, 'constat_solde')).toBe(2);
		expect(compter(b, 'import_releve')).toBe(2);
	});

	it('un fichier illisible n’écrit rien', () => {
		const r = b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'x.ofx',
			octets: ofxCp1252(ofxTexte(LIGNES_FICTIVES).replace('</OFX>', ''))
		});
		expect(r).toMatchObject({ ok: false, erreur: { code: 'fichier_illisible' } });
		expect(compter(b, 'import_releve')).toBe(0);
		expect(compter(b, 'ligne_releve')).toBe(0);
		expect(b.fichiers.size).toBe(0);
	});

	it('une panne d’écriture du fichier annule toute la transaction', () => {
		b.app.socle.fichiers.ecrire = () => {
			throw new Error('disque plein');
		};
		expect(() => importer(b, LIGNES_FICTIVES)).toThrow('disque plein');
		expect(compter(b, 'import_releve')).toBe(0);
		expect(compter(b, 'ligne_releve')).toBe(0);
	});

	it('P6 : une ligne antérieure à l’ancre est écartée et comptée', () => {
		const r = importer(b, [
			{ date: '20260830', montant: '-1.00', id: 'V1', libelle: 'AVANT' },
			...LIGNES_FICTIVES
		]);
		expect(r).toMatchObject({ ok: true, valeur: { lues: 4, nouvelles: 3, ecartees: 1 } });
		expect(lignes(b).some((l) => l.libelle === 'AVANT')).toBe(false);
	});

	it('deux lignes identiques passent à confirmer', () => {
		const r = importer(b, [
			{ date: '20261005', montant: '-5.00', id: 'A', libelle: 'CB FICTIVE' },
			{ date: '20261005', montant: '-5.00', id: 'B', libelle: 'CB FICTIVE' }
		]);
		expect(r).toMatchObject({ ok: true, valeur: { aConfirmer: 2 } });
		expect(lignes(b).map((l) => l.doublon)).toEqual(['a_confirmer', 'a_confirmer']);
	});

	it('un écart de dates avec l’import précédent se signale', () => {
		importer(b, [{ date: '20261003', montant: '-1.00', id: '1', libelle: 'A' }]);
		const r = importer(b, [{ date: '20261028', montant: '-1.00', id: '2', libelle: 'B' }]);
		expect(r).toMatchObject({
			ok: true,
			valeur: { trou: { debut: '2026-10-03', fin: '2026-10-28' } }
		});
	});

	it('sans solde dans le fichier, il se demande, et un Constat de source saisie se crée', () => {
		const r = importer(b, LIGNES_FICTIVES, null);
		expect(r).toMatchObject({ ok: true, valeur: { soldeDemande: { date: '2026-10-12' } } });
		expect(compter(b, 'constat_solde')).toBe(0);
		const s = b.app.pointage.saisirSolde(b.ctx(), {
			compteId: ccp,
			date: '2026-10-12',
			solde: c(150000)
		});
		expect(s.ok).toBe(true);
		expect(b.base.prepare('SELECT source, import_id FROM constat_solde').get()).toEqual({
			source: 'saisie',
			import_id: null
		});
	});

	it('seuls les Comptes banque et épargne importent, et il faut le droit', () => {
		const r = b.app.pointage.importer(b.ctx(), {
			compteId: caisse,
			nomFichier: NOM,
			octets: ofxCp1252(ofxTexte(LIGNES_FICTIVES))
		});
		expect(r).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
		const lecteur = b.app.ctx({ ...b.tresorier, role: 'lecteur' });
		expect(
			b.app.pointage.importer(lecteur, {
				compteId: ccp,
				nomFichier: NOM,
				octets: ofxCp1252(ofxTexte(LIGNES_FICTIVES))
			})
		).toMatchObject({ ok: false, erreur: { code: 'acces_refuse' } });
	});

	it('un fichier sans aucune ligne ne plante pas', () => {
		const r = importer(b, [], null);
		expect(r).toMatchObject({ ok: true, valeur: { lues: 0, nouvelles: 0 } });
		expect(compter(b, 'import_releve')).toBe(0);
	});
});

describe('Exercice clôturé (AD-9)', () => {
	it('les lignes passent, le solde est ignoré, et le récapitulatif le dit', () => {
		const base = baseAvecCloture();
		const horloge = { maintenant: () => '2026-11-04T10:00:00.000Z' };
		const app = composer({
			base,
			horloge,
			journaliseur: { info() {}, erreur() {} },
			fichiers: { ecrire: () => 'f', lire: () => null }
		});
		const ctx = app.ctx({
			id: 1,
			identifiant: 'test',
			nomAffiche: 'Personne fictive',
			role: 'tresorier',
			preferences: { theme: 'systeme', raccourcis: true }
		});
		const r = app.pointage.importer(ctx, {
			compteId: 1,
			nomFichier: NOM,
			octets: ofxCp1252(
				ofxTexte([{ date: '20260820', montant: '-5.00', id: 'Z', libelle: 'AOÛT' }], {
					montant: '12.00',
					date: '20260831'
				})
			)
		});
		expect(r).toMatchObject({ ok: true, valeur: { nouvelles: 1, soldeIgnore: true } });
		const constats = base.prepare('SELECT COUNT(*) FROM constat_solde').pluck().get();
		expect(constats).toBe(2);

		// Saisi à la main dans ce même Exercice, il est refusé.
		expect(
			app.pointage.saisirSolde(ctx, { compteId: 1, date: '2026-08-31', solde: c(1200) })
		).toMatchObject({ ok: false, erreur: { code: 'exercice_cloture' } });

		// La Ligne d'août reste pointable après la clôture, par une Opération de l'Exercice ouvert.
		const ligne = base.prepare("SELECT id FROM ligne_releve WHERE libelle = 'AOÛT'").pluck().get();
		const aSaisir = app.pointage.ligneASaisir(ctx, ligne as number);
		expect(aSaisir).toMatchObject({ ok: true, valeur: { date: '2026-09-01', rattachementId: 1 } });

		// Le Pointage du 1er relie deux éléments clôturés : il ne s'annule plus.
		expect(app.pointage.annuler(ctx, 1)).toMatchObject({
			ok: false,
			erreur: { code: 'pointage_fige' }
		});
	});
});

describe('CSV (story 3.4)', () => {
	const fichier = (lignesCsv: string[]) => utf8(lignesCsv.join('\n'));
	const CSV = fichier([
		'Date;Libellé;Montant',
		'12/10/2026;École;"1 234,56"',
		'13/10/2026;CB;-3,50'
	]);

	it('le premier CSV demande la correspondance, sans rien importer', () => {
		const r = b.app.pointage.importer(b.ctx(), { compteId: ccp, nomFichier: 'a.csv', octets: CSV });
		expect(r).toMatchObject({
			ok: true,
			valeur: {
				type: 'correspondance',
				colonneAbsente: null,
				tableau: { entetes: ['Date', 'Libellé', 'Montant'] },
				reglage: REGLAGE
			}
		});
		expect(compter(b, 'ligne_releve')).toBe(0);
	});

	it('le réglage validé s’applique ensuite sans demander', () => {
		const r = b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'a.csv',
			octets: CSV,
			reglage: REGLAGE
		});
		expect(r).toMatchObject({
			ok: true,
			valeur: { type: 'recapitulatif', nouvelles: 2, soldeDemande: { date: '2026-10-13' } }
		});
		expect(b.base.prepare('SELECT reglage_json FROM profil_csv').pluck().get()).toBe(
			JSON.stringify(REGLAGE)
		);
		const autre = fichier(['Date;Libellé;Montant', '14/10/2026;Autre;1,00']);
		const s = b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'b.csv',
			octets: autre
		});
		expect(s).toMatchObject({ ok: true, valeur: { type: 'recapitulatif', nouvelles: 1 } });
		expect(b.base.prepare('SELECT source FROM import_releve').pluck().all()).toEqual([
			'csv',
			'csv'
		]);
	});

	it('une colonne disparue n’importe rien, et rouvre la correspondance', () => {
		b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'a.csv',
			octets: CSV,
			reglage: REGLAGE
		});
		const r = b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'b.csv',
			octets: fichier(['Date;Libellé;Valeur', '14/10/2026;Autre;1,00'])
		});
		expect(r).toMatchObject({
			ok: true,
			valeur: { type: 'correspondance', colonneAbsente: 'Montant' }
		});
		expect(compter(b, 'ligne_releve')).toBe(2);
	});

	it('un fichier qui n’est ni OFX ni CSV est refusé', () => {
		expect(
			b.app.pointage.importer(b.ctx(), {
				compteId: ccp,
				nomFichier: 'x.pdf',
				octets: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1])
			})
		).toMatchObject({ ok: false, erreur: { code: 'fichier_illisible' } });
	});

	it('une valeur illisible avec un réglage connu refuse le fichier entier', () => {
		const r = b.app.pointage.importer(b.ctx(), {
			compteId: ccp,
			nomFichier: 'x.csv',
			octets: fichier(['Date;Libellé;Montant', '14/10/2026;Autre;douze']),
			reglage: REGLAGE
		});
		expect(r).toMatchObject({ ok: false, erreur: { code: 'fichier_illisible' } });
		expect(compter(b, 'profil_csv')).toBe(0);
	});
});

describe('Lignes de relevé', () => {
	it('saisir une ligne : import_id nul, mêmes doublons', () => {
		const e = { compteId: ccp, date: '2026-10-05', montant: c(-500), libelle: 'FRAIS FICTIFS' };
		expect(b.app.pointage.saisirLigne(b.ctx(), e).ok).toBe(true);
		expect(b.app.pointage.saisirLigne(b.ctx(), e).ok).toBe(true);
		expect(lignes(b).map((l) => [l.importId, l.doublon])).toEqual([
			[null, 'non'],
			[null, 'a_confirmer']
		]);
	});

	it('refuse une ligne avant l’ancre, ou sur une caisse', () => {
		expect(
			b.app.pointage.saisirLigne(b.ctx(), {
				compteId: ccp,
				date: '2026-08-05',
				montant: c(-500),
				libelle: 'A'
			})
		).toMatchObject({
			ok: false,
			erreur: { code: 'ligne_avant_ancre', details: { champ: 'date' } }
		});
		expect(
			b.app.pointage.saisirLigne(b.ctx(), {
				compteId: caisse,
				date: '2026-10-05',
				montant: c(-500),
				libelle: 'A'
			})
		).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
		expect(
			b.app.pointage.saisirSolde(b.ctx(), { compteId: caisse, date: '2026-10-05', solde: c(1) })
		).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
	});

	it('P5 : chaque doublon se confirme ou s’écarte, une ligne importée reste sinon', () => {
		importer(b, [
			{ date: '20261005', montant: '-5.00', id: 'A', libelle: 'CB FICTIVE' },
			{ date: '20261005', montant: '-5.00', id: 'B', libelle: 'CB FICTIVE' },
			{ date: '20261006', montant: '-6.00', id: 'C', libelle: 'AUTRE' }
		]);
		const [a, d, autre] = lignes(b).map((l) => l.id) as [number, number, number];
		expect(b.app.pointage.confirmerLigne(b.ctx(), a).ok).toBe(true);
		expect(b.app.pointage.retirerLigne(b.ctx(), d).ok).toBe(true);
		expect(lignes(b).map((l) => [l.identifiantSource, l.doublon])).toEqual([
			['A', 'confirme'],
			['C', 'non']
		]);
		expect(b.app.pointage.retirerLigne(b.ctx(), autre)).toMatchObject({
			ok: false,
			erreur: { code: 'ligne_releve_conservee' }
		});
		expect(b.app.pointage.retirerLigne(b.ctx(), 9999)).toMatchObject({
			erreur: { code: 'element_introuvable' }
		});
		expect(b.app.pointage.confirmerLigne(b.ctx(), 9999)).toMatchObject({
			erreur: { code: 'element_introuvable' }
		});
	});
});

describe('pointer (stories 3.7, 3.8)', () => {
	function ligneId(libelle: string) {
		return lignes(b).find((l) => l.libelle === libelle)?.id as number;
	}

	beforeEach(() => {
		importer(b, LIGNES_FICTIVES);
	});

	const LIBELLE = LIGNES_FICTIVES[0]?.libelle as string;

	it('pointer crée le Pointage et note au Journal', () => {
		const op = operation(b, { montant: 100000, libelle: 'Autocars imaginaires' });
		const r = b.app.pointage.pointer(b.ctx(), {
			compteId: ccp,
			coteIds: [coteDe(b, op)],
			ligneIds: [ligneId(LIBELLE)]
		});
		expect(r.ok).toBe(true);
		expect(compter(b, 'pointage')).toBe(1);
		expect(b.journal().at(-1)).toMatchObject({
			evenement: 'pointage.cree',
			resume: expect.stringContaining('a pointé')
		});
		const detail = b.app.operations.detail(b.ctx(), op);
		expect(detail).toMatchObject({
			ok: true,
			valeur: { pointee: true, mouvements: [{ libelle: LIBELLE }], pointageIds: [1] }
		});
	});

	it('refuse Côté d’un autre Compte ou somme inégale', () => {
		const op = operation(b, { montant: 90000, libelle: 'Autre montant' });
		expect(
			b.app.pointage.pointer(b.ctx(), {
				compteId: ccp,
				coteIds: [coteDe(b, op)],
				ligneIds: [ligneId(LIBELLE)]
			})
		).toMatchObject({ ok: false, erreur: { code: 'pointage_desequilibre' } });
		expect(compter(b, 'pointage')).toBe(0);
	});

	it('annuler retire le Pointage, le Journal gardant son contenu', () => {
		const op = operation(b, { montant: 100000, libelle: 'Autocars' });
		const r = b.app.pointage.pointer(b.ctx(), {
			compteId: ccp,
			coteIds: [coteDe(b, op)],
			ligneIds: [ligneId(LIBELLE)]
		});
		if (!r.ok) throw new Error();
		expect(b.app.pointage.annuler(b.ctx(), r.valeur.id).ok).toBe(true);
		expect(compter(b, 'pointage')).toBe(0);
		expect(compter(b, 'pointage_cote')).toBe(0);
		const avant = b.base
			.prepare("SELECT avant_json FROM journal_modification WHERE evenement = 'pointage.annule'")
			.pluck()
			.get() as string;
		expect(JSON.parse(avant)).toMatchObject({ coteIds: [coteDe(b, op)] });
		expect(b.app.pointage.annuler(b.ctx(), 9999)).toMatchObject({
			erreur: { code: 'element_introuvable' }
		});
	});

	it('une Opération pointée ne s’annule pas', () => {
		const op = operation(b, { montant: 100000, libelle: 'Autocars' });
		const r = b.app.pointage.pointer(b.ctx(), {
			compteId: ccp,
			coteIds: [coteDe(b, op)],
			ligneIds: [ligneId(LIBELLE)]
		});
		expect(r.ok).toBe(true);
		expect(b.app.operations.annuler(b.ctx(), op)).toMatchObject({ ok: false });
	});

	it('N-N : deux Opérations pour une Ligne, à somme égale', () => {
		const a = operation(b, { montant: 60000, libelle: 'Part une' });
		const d = operation(b, { montant: 40000, libelle: 'Part deux' });
		const r = b.app.pointage.pointer(b.ctx(), {
			compteId: ccp,
			coteIds: [coteDe(b, a), coteDe(b, d)],
			ligneIds: [ligneId(LIBELLE)]
		});
		expect(r.ok).toBe(true);
		expect(compter(b, 'pointage_cote')).toBe(2);
	});

	it('ajuster crée une Opération ajustement dont le Côté entre dans le Pointage (P2)', () => {
		const op = operation(b, { montant: 99999, libelle: 'Presque juste' });
		const r = b.app.pointage.ajuster(b.ctx(), {
			compteId: ccp,
			coteIds: [coteDe(b, op)],
			ligneIds: [ligneId(LIBELLE)]
		});
		if (!r.ok) throw new Error(r.erreur.code);
		const ajustement = b.app.socle.depots.operations.parId(r.valeur.operationId);
		expect(ajustement).toMatchObject({
			origine: 'ajustement',
			genre: 'standard',
			date: '2026-10-05',
			sansPiece: true,
			cotes: [{ montant: -1 }],
			lignes: [{ montant: -1 }]
		});
		const natures = b.app.socle.depots.parametrage.natures();
		expect(natures.find((n) => n.id === ajustement?.lignes[0]?.natureId)?.codeSysteme).toBe(
			'ajustement'
		);
		expect(compter(b, 'pointage_cote')).toBe(2);
	});

	it('sans différence, pas d’ajustement', () => {
		const op = operation(b, { montant: 100000, libelle: 'Juste' });
		expect(
			b.app.pointage.ajuster(b.ctx(), {
				compteId: ccp,
				coteIds: [coteDe(b, op)],
				ligneIds: [ligneId(LIBELLE)]
			})
		).toMatchObject({ ok: false, erreur: { code: 'pointage_incoherent' } });
		expect(
			b.app.pointage.ajuster(b.ctx(), { compteId: ccp, coteIds: [], ligneIds: [] })
		).toMatchObject({ ok: false });
	});

	it('aucun module n’écrit de Pointage sans appel explicite : page et propositions restent en lecture', () => {
		operation(b, { montant: 100000, libelle: 'Autocars', reference: 'FA-2026-14' });
		const avant = compter(b, 'pointage') + b.journal().length;
		const page = b.app.pointage.page(b.ctx(), ccp, null);
		if (!page.ok) throw new Error();
		const ligne = page.valeur.lignes.find((l) => l.libelle === LIBELLE);
		expect(ligne?.propositions[0]).toMatchObject({
			raison: 'Même montant, n° de facture lu dans le libellé',
			preselection: true
		});
		expect(compter(b, 'pointage') + b.journal().length).toBe(avant);
	});

	it('candidats : Côtés non pointés du Compte, par recherche', () => {
		const op = operation(b, { montant: 100, libelle: 'Papeterie du coin' });
		operation(b, { montant: 200, libelle: 'Autocars' });
		const tous = b.app.pointage.candidats(b.ctx(), ccp, '');
		expect(tous.ok && tous.valeur).toHaveLength(2);
		expect(b.app.pointage.candidats(b.ctx(), ccp, 'papeterie')).toMatchObject({
			ok: true,
			valeur: [{ operationId: op, libelle: 'Papeterie du coin', montant: -100 }]
		});
	});

	it('page : barre, compteur, Compte absent', () => {
		const r = b.app.pointage.page(b.ctx(), ccp, null);
		expect(r).toMatchObject({
			ok: true,
			valeur: {
				compte: { libelle: 'CCP' },
				barre: { releve: 150000, calcule: 100000, ecart: 50000, pointees: 0, total: 3 }
			}
		});
		expect(b.app.pointage.aPointer(b.ctx())).toEqual({ ok: true, valeur: 3 });
		expect(b.app.pointage.comptes(b.ctx())).toMatchObject({
			ok: true,
			valeur: [{ libelle: 'CCP' }, { libelle: 'Livret' }]
		});
		expect(b.app.pointage.page(b.ctx(), caisse, null)).toMatchObject({
			erreur: { code: 'element_introuvable' }
		});
	});
});

describe('créer depuis une Ligne de relevé (story 3.9)', () => {
	const saisie = (montant: number) => ({
		forme: 'standard' as const,
		libelle: 'Frais fictifs',
		reference: null,
		modePaiement: null,
		note: null,
		tiers: null,
		intention: 'depense' as const,
		compteId: ccp,
		date: '2026-10-08',
		montant: c(montant),
		lignes: [
			{
				montant: c(montant),
				contraire: false,
				reduction: false,
				natureId: nature,
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		]
	});
	let ligne: number;

	beforeEach(() => {
		importer(b, LIGNES_FICTIVES);
		ligne = lignes(b).find((l) => l.montant === -350)?.id as number;
	});

	it('reprend date, montant et libellé', () => {
		expect(b.app.pointage.ligneASaisir(b.ctx(), ligne)).toMatchObject({
			ok: true,
			valeur: {
				date: '2026-10-08',
				montant: -350,
				libelle: 'FRAIS TENUE DE COMPTE',
				compteId: ccp,
				rattachementId: null
			}
		});
		expect(b.app.pointage.ligneASaisir(b.ctx(), 9999)).toMatchObject({
			erreur: { code: 'element_introuvable' }
		});
	});

	it('Opération et Pointage s’enregistrent dans la même transaction', () => {
		const r = b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: ligne, saisie: saisie(350) });
		expect(r.ok).toBe(true);
		expect(compter(b, 'operation')).toBe(1);
		expect(compter(b, 'pointage')).toBe(1);
	});

	it('un échec de validation n’écrit rien, et la ligne reste à pointer', () => {
		const r = b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: ligne, saisie: saisie(351) });
		expect(r).toMatchObject({ ok: false, erreur: { code: 'pointage_desequilibre' } });
		expect(compter(b, 'operation')).toBe(0);
		expect(compter(b, 'pointage')).toBe(0);
		const invalide = { ...saisie(350), date: '2026-08-08' };
		expect(b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: ligne, saisie: invalide }).ok).toBe(
			false
		);
		expect(compter(b, 'operation')).toBe(0);
	});

	it('un renvoi après une coupure n’écrit pas deux fois', () => {
		const e = { ligneId: ligne, saisie: saisie(350), cle: 'cle-fictive' };
		const r = b.app.pointage.creerDepuisLigne(b.ctx(), e);
		const s = b.app.pointage.creerDepuisLigne(b.ctx(), e);
		expect(r.ok && s.ok && r.valeur.id === s.valeur.id).toBe(true);
		expect(compter(b, 'operation')).toBe(1);
	});

	it('refuse une ligne à confirmer, inconnue, ou une Opération sans ce Compte', () => {
		expect(
			b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: 9999, saisie: saisie(350) })
		).toMatchObject({ erreur: { code: 'element_introuvable' } });
		const sur = { ...saisie(350), compteId: livret };
		expect(b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: ligne, saisie: sur })).toMatchObject(
			{ erreur: { code: 'pointage_incoherent' } }
		);
		b.base.prepare(`UPDATE ligne_releve SET doublon = 'a_confirmer' WHERE id = ?`).run(ligne);
		expect(
			b.app.pointage.creerDepuisLigne(b.ctx(), { ligneId: ligne, saisie: saisie(350) })
		).toMatchObject({ erreur: { code: 'doublon_a_confirmer' } });
		expect(compter(b, 'operation')).toBe(0);
	});
});

describe('aucun « tout valider » (story 3.6)', () => {
	const code = sources('src', ['.ts', '.svelte']);

	it('rien n’écrit à partir de proposer() : elle n’atteint que la vue en lecture', () => {
		const appelants = code
			.filter((f) => /import\s*\{[^}]*\bproposer\b[^}]*\}/.test(f.contenu))
			.filter((f) => !f.chemin.startsWith('src/lib/domaine/releve/'))
			.map((f) => f.chemin);
		expect(appelants).toEqual([]);
	});

	it('un seul appel crée un Pointage, et il part d’une action explicite', () => {
		const appels = code
			.filter((f) => /depot\.creerPointage|pointage\.creerPointage/.test(f.contenu))
			.map((f) => f.chemin);
		expect(appels).toEqual(['src/lib/server/application/pointage/index.ts']);
		expect(code.filter((f) => /tout[_ ]?valider|pointerTout/i.test(f.contenu))).toEqual([]);
	});
});
