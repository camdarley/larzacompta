import { beforeEach, describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import { ETAPE_ASSISTANT_TERMINE } from '#lib/domaine/assistant.ts';
import { banc, type Banc } from './aides/app.ts';

let b: Banc;
let e: Banc['app']['exercices'];
let p: Banc['app']['parametrage'];

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

beforeEach(() => {
	b = banc();
	e = b.app.exercices;
	p = b.app.parametrage;
	valeur(
		p.enregistrerAssociation(b.ctx(), {
			nom: 'APE des Tilleuls',
			adresse: '',
			moisDebutExercice: 9,
			mentionsFacture: ''
		})
	);
});

const ancres = () => valeur(p.comptes(b.ctx())).map((c) => c.ancre?.solde ?? null);

describe('premier Exercice', () => {
	it('chaque Compte reçoit une seule ancre, au début de l’Exercice (E6)', () => {
		const ccp = valeur(p.creerCompte(b.ctx(), { libelle: 'CCP', type: 'banque' }));
		valeur(p.creerCompte(b.ctx(), { libelle: 'Livret', type: 'epargne' }));
		const ex = valeur(
			e.ouvrirPremier(b.ctx(), {
				anneeDebut: 2026,
				soldes: [{ compteId: ccp, solde: centimes(120000) }]
			})
		);
		expect(ex.debut).toBe('2026-09-01');
		expect(ancres()).toEqual([120000, 0]);
		const lignes = b.base.prepare('SELECT count(*) FROM balance_ouverture').pluck().get();
		expect(lignes).toBe(2);
	});

	it('refuse un second premier Exercice', () => {
		valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		const r = e.ouvrirPremier(b.ctx(), { anneeDebut: 2027, soldes: [] });
		expect(!r.ok && r.erreur.code).toBe('exercice_invalide');
	});
});

describe('Exercice suivant', () => {
	it('aucun solde n’est copié, deux Exercices coexistent, le troisième est refusé', () => {
		const ccp = valeur(p.creerCompte(b.ctx(), { libelle: 'CCP', type: 'banque' }));
		valeur(
			e.ouvrirPremier(b.ctx(), {
				anneeDebut: 2026,
				soldes: [{ compteId: ccp, solde: centimes(100) }]
			})
		);
		const suivant = valeur(e.ouvrirSuivant(b.ctx()));
		expect(suivant).toMatchObject({ libelle: '2027-2028', debut: '2027-09-01', statut: 'ouvert' });
		expect(b.base.prepare('SELECT count(*) FROM balance_ouverture').pluck().get()).toBe(1);
		const r = e.ouvrirSuivant(b.ctx());
		expect(!r.ok && r.erreur.code).toBe('exercice_invalide');
	});

	it('E5 : pas de réouverture, un Exercice clôturé reste clôturé', () => {
		valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		b.base.exec(`UPDATE exercice SET statut = 'cloture'`);
		expect(() => b.base.exec(`UPDATE exercice SET statut = 'ouvert'`)).toThrow('exercice_cloture');
	});
});

describe('repère', () => {
	it('E2 : s’ajoute avec son seul nom, sans dates ni ancre', () => {
		valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		const r = valeur(e.ajouterRepere(b.ctx(), '2024-2025'));
		expect(r).toMatchObject({ anneeDebut: 2024, debut: null, fin: null, statut: 'repere' });
	});
});

describe('Balance d’ouverture', () => {
	let ccp: number;
	let exId: number;

	beforeEach(() => {
		ccp = valeur(p.creerCompte(b.ctx(), { libelle: 'CCP', type: 'banque' }));
		exId = valeur(
			e.ouvrirPremier(b.ctx(), {
				anneeDebut: 2026,
				soldes: [{ compteId: ccp, solde: centimes(100) }]
			})
		).id;
	});

	it('E7 : se modifie tant que rien de dépendant n’est clôturé', () => {
		valeur(
			e.enregistrerBalance(b.ctx(), {
				exerciceId: exId,
				soldes: [{ compteId: ccp, solde: centimes(250) }]
			})
		);
		expect(ancres()).toEqual([250]);
	});

	it('E7 : se fige une fois l’Exercice clôturé', () => {
		b.base.exec(`UPDATE exercice SET statut = 'cloture'`);
		const suivant = valeur(e.ouvrirSuivant(b.ctx()));
		const r = e.enregistrerBalance(b.ctx(), {
			exerciceId: suivant.id,
			soldes: [{ compteId: ccp, solde: centimes(250) }]
		});
		expect(!r.ok && r.erreur.code).toBe('exercice_cloture');
	});

	it('E6 : un Compte créé plus tard s’ancre à 0 ou au début d’un Exercice ouvert', () => {
		const sans = valeur(p.creerCompte(b.ctx(), { libelle: 'Livret', type: 'epargne' }));
		expect(valeur(p.comptes(b.ctx())).find((c) => c.id === sans)?.ancre).toBeNull();
		valeur(
			p.creerCompte(b.ctx(), {
				libelle: 'Caisse',
				type: 'caisse',
				ancre: { exerciceId: exId, solde: centimes(5000) }
			})
		);
		expect(ancres()).toEqual([100, null, 5000]);
	});

	it('E6 : refuse une ancre sur un repère', () => {
		const repere = valeur(e.ajouterRepere(b.ctx(), '2024-2025'));
		const r = p.creerCompte(b.ctx(), {
			libelle: 'Caisse',
			type: 'caisse',
			ancre: { exerciceId: repere.id, solde: centimes(1) }
		});
		expect(!r.ok && r.erreur.code).toBe('ancre_invalide');
		// La transaction a tout annulé, Compte compris.
		expect(valeur(p.comptes(b.ctx()))).toHaveLength(1);
	});

	it('refuse un Compte inconnu', () => {
		const r = e.enregistrerBalance(b.ctx(), {
			exerciceId: exId,
			soldes: [{ compteId: 999, solde: centimes(1) }]
		});
		expect(!r.ok && r.erreur.code).toBe('element_introuvable');
	});

	it('expose les soldes de départ de l’Exercice', () => {
		expect(valeur(p.soldesDepart(b.ctx(), exId)).map((s) => s.solde)).toEqual([100]);
	});
});

describe('démarrage par l’assistant', () => {
	const comptes = [
		{ libelle: 'Compte courant', type: 'banque' as const, solde: centimes(150000) },
		{ libelle: 'Livret', type: 'epargne' as const, solde: centimes(900000) },
		{ libelle: 'Caisse', type: 'caisse' as const, solde: centimes(25000) }
	];

	it('ouvre 2026-2027 avec ces ancres et ajoute l’Exercice précédent comme repère', () => {
		const ex = valeur(e.demarrer(b.ctx(), { anneeDebut: 2026, comptes }));
		expect(ex.debut).toBe('2026-09-01');
		expect(ancres()).toEqual([150000, 900000, 25000]);
		expect(valeur(e.lister(b.ctx())).map((x) => [x.libelle, x.statut])).toEqual([
			['2025-2026', 'repere'],
			['2026-2027', 'ouvert']
		]);
		expect(p.association()?.etapeAssistant).toBe(3);
	});

	it('se rejoue sans doublon : un retour corrige', () => {
		valeur(e.demarrer(b.ctx(), { anneeDebut: 2026, comptes }));
		const [cc, livret] = valeur(p.comptes(b.ctx()));
		valeur(
			e.demarrer(b.ctx(), {
				anneeDebut: 2026,
				comptes: [
					{ id: cc?.id, libelle: 'CCP', type: 'banque', solde: centimes(160000) },
					{ id: livret?.id, libelle: 'Livret', type: 'epargne', solde: centimes(900000) }
				]
			})
		);
		const apres = valeur(p.comptes(b.ctx()));
		expect(apres).toHaveLength(3);
		expect(apres[0]).toMatchObject({ libelle: 'CCP' });
		expect(apres[0]?.ancre?.solde).toBe(160000);
		expect(valeur(e.lister(b.ctx()))).toHaveLength(2);
	});

	it('annule tout si un libellé se répète', () => {
		const r = e.demarrer(b.ctx(), {
			anneeDebut: 2026,
			comptes: [...comptes, { libelle: 'livret', type: 'epargne', solde: centimes(1) }]
		});
		expect(!r.ok && r.erreur.code).toBe('libelle_deja_utilise');
		expect(valeur(p.comptes(b.ctx()))).toEqual([]);
		expect(valeur(e.lister(b.ctx()))).toEqual([]);
	});

	it('mémorise l’étape', () => {
		valeur(p.definirEtapeAssistant(b.ctx(), ETAPE_ASSISTANT_TERMINE));
		expect(p.association()?.etapeAssistant).toBe(ETAPE_ASSISTANT_TERMINE);
	});

	it('exige une APE décrite', () => {
		const vide = banc();
		const r = vide.app.exercices.demarrer(vide.ctx(), { anneeDebut: 2026, comptes });
		expect(!r.ok && r.erreur.code).toBe('association_absente');
		const etape = vide.app.parametrage.definirEtapeAssistant(vide.ctx(), 2);
		expect(!etape.ok && etape.erreur.code).toBe('association_absente');
	});
});

describe('sélection', () => {
	it('suit l’URL et retombe sur le plus récent', () => {
		valeur(e.ouvrirPremier(b.ctx(), { anneeDebut: 2026, soldes: [] }));
		valeur(e.ouvrirSuivant(b.ctx()));
		expect(valeur(e.selection(b.ctx(), null))?.libelle).toBe('2027-2028');
		expect(valeur(e.selection(b.ctx(), '2026-2027'))?.libelle).toBe('2026-2027');
		expect(e.anneeCourante(b.ctx(), 9)).toBe(2026);
	});
});
