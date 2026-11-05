/**
 * Non-régression de la revue indépendante de la v1, hors caisses : un état clôturé qui bouge, un
 * calcul qui fige le serveur, un plafond contourné, un mot de passe testé sans limite.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { totalFacture } from '#lib/domaine/factures/index.ts';
import { ouverts } from '#lib/domaine/etats/ecart.ts';
import { etatTresorerie } from '#lib/domaine/etats/tresorerie.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import { centimes as c, MONTANT_MAX } from '#lib/domaine/montant.ts';
import { schemaComptageSession } from '#lib/schemas/caisses.ts';
import { schemaApercuFacture, schemaFacture } from '#lib/schemas/factures.ts';
import { parametrageDe } from '#lib/server/application/etats/index.ts';
import { MAX_LIGNES_IMPORT } from '#lib/server/application/pointage/index.ts';
import { banc } from './aides/app.ts';
import { instancePrete, valeur } from './aides/instance.ts';

let i: ReturnType<typeof instancePrete>;
const j = () => i.app.socle.depots.operations.journal();
const quand = (jour: string) => {
	i.horloge.instant = `${jour}T18:00:00.000Z`;
};
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);
const exercices = () => i.app.socle.depots.exercices.lister();

beforeEach(() => {
	i = instancePrete();
});

describe('le Document d’AG clos ne bouge plus', () => {
	const clos = () => exercices().find((x) => x.id === i.courant.id) as (typeof i)['courant'];
	const document = () => JSON.stringify(valeur(i.app.etats.modele(i.ctx(), 'document-ag', clos())));
	const bilan = () => valeur(i.app.etats.tableau(i.ctx(), clos())).bilan;

	function cloturer() {
		quand('2027-08-31');
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: i.compteId,
				date: '2027-08-31',
				solde: c(1000_00)
			})
		);
		quand('2027-09-02');
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), i.courant.id));
	}

	it('ni par une Ligne saisie après la clôture et datée dedans', () => {
		cloturer();
		const avant = document();
		quand('2027-09-20');
		valeur(
			i.app.pointage.saisirLigne(i.ctx(), {
				compteId: i.compteId,
				date: '2027-08-30',
				montant: c(-50_00),
				libelle: 'Frais d’août'
			})
		);
		expect(document()).toBe(avant);
		expect(bilan()).toEqual({ type: 'cloture', comptes: 0 });
	});

	it('ni par une Ligne d’avant la clôture, retirée après', () => {
		quand('2027-08-30');
		const ligne = valeur(
			i.app.pointage.saisirLigne(i.ctx(), {
				compteId: i.compteId,
				date: '2027-08-30',
				montant: c(-50_00),
				libelle: 'Frais d’août'
			})
		);
		cloturer();
		quand('2027-09-20');
		expect(code(i.app.pointage.retirerLigne(i.ctx(), ligne.id))).toBe('exercice_cloture');
	});
});

describe('volume de relevé', () => {
	it('lit les éléments ouverts de 20 000 lignes sans repasser par elles une à une', () => {
		const base = j();
		const lignes = Array.from({ length: 20_000 }, (_, n) => ({
			id: n + 1,
			compteId: i.compteId,
			date: '2026-10-05',
			montant: c(100),
			libelle: `Ligne ${n}`,
			doublon: 'non' as const,
			importId: 1,
			identifiantSource: null,
			empreinte: String(n),
			creeLe: '2026-10-05T10:00:00.000Z'
		}));
		const pointages = lignes.slice(0, 5_000).map((l) => ({
			id: l.id,
			compteId: i.compteId,
			coteIds: [],
			ligneReleveIds: [l.id],
			creeLe: l.creeLe
		}));
		const debut = performance.now();
		const o = ouverts({ ...base, lignesReleve: lignes, pointages }, i.compteId, '2026-10-05');
		expect(o.lignes).toHaveLength(15_000);
		expect(performance.now() - debut).toBeLessThan(1000);
	});

	it('refuse un fichier trop long, sans rien écrire', () => {
		const lignes = Array.from(
			{ length: MAX_LIGNES_IMPORT + 1 },
			(_, n) => `05/10/2026;Ligne ${n};-1,00`
		);
		const reglage = {
			date: 'Date',
			libelle: 'Libellé',
			identifiant: null,
			montant: { mode: 'unique' as const, colonne: 'Montant' }
		};
		const r = i.app.pointage.importer(i.ctx(), {
			compteId: i.compteId,
			nomFichier: 'trop-long.csv',
			octets: new TextEncoder().encode(['Date;Libellé;Montant', ...lignes].join('\n')),
			reglage,
			autreCompte: false
		});
		expect(code(r)).toBe('releve_trop_long');
		expect(j().lignesReleve).toHaveLength(0);
	});
});

describe('plafonds de saisie', () => {
	const brouillon = (quantite: number, prixUnitaire: number) => ({
		tiersNom: 'Tiers fictif',
		tiersAdresse: '',
		dateEmission: null,
		actionId: null,
		lignes: [{ designation: 'Ligne', quantite, prixUnitaire }]
	});

	it('une Facture refuse un produit ou une somme au-delà de MONTANT_MAX', () => {
		for (const schema of [schemaFacture, schemaApercuFacture]) {
			const r = schema.safeParse(brouillon(1_000_000, 10_000_000_000));
			expect(r.error?.issues[0]?.message).toBe('montant_invalide');
			expect(schema.safeParse(brouillon(1, MONTANT_MAX)).success).toBe(true);
			const deux = brouillon(1, MONTANT_MAX);
			deux.lignes.push({ designation: 'Autre', quantite: 1, prixUnitaire: 1 });
			expect(schema.safeParse(deux).success).toBe(false);
		}
	});

	it('un brouillon déjà démesuré reste lisible, exportable et supprimable', () => {
		const lignes = [{ designation: 'L', quantite: 1_000_000, prixUnitaire: c(10_000_000_000) }];
		expect(totalFacture(lignes as never)).toBe(Number.MAX_SAFE_INTEGER);
	});

	it('un Comptage ne dépasse pas MONTANT_MAX, seul ou par ses coupures', () => {
		const lire = (quantite: number) =>
			schemaComptageSession.safeParse({
				coupures: [{ coupure: 50000, quantite }],
				date: '2026-10-10',
				confirmation: null
			}).success;
		expect(lire(1_000_000)).toBe(false);
		expect(lire(100)).toBe(true);
	});
});

describe('corrections', () => {
	it('un rendu corrigé ne dépasse pas la somme reçue (FR-8)', () => {
		quand('2026-10-05');
		const nature = i.app.socle.depots.parametrage
			.natures()
			.find((n) => n.codeSysteme === 'somme_a_rendre');
		const ligne = (montant: number) => [
			{
				montant: c(montant),
				contraire: false,
				reduction: false,
				natureId: nature?.id as number,
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		];
		const saisie = (sens: 'recette' | 'depense', montant: number) => ({
			...i.saisie(sens, montant, { date: '2026-10-05' }),
			lignes: ligne(montant)
		});
		const recu = valeur(i.app.operations.creer(i.ctx(), saisie('recette', 100_00)));
		const rendu = valeur(
			i.app.operations.creer(i.ctx(), { ...saisie('depense', 40_00), rendDe: recu.id })
		);
		const op = i.app.socle.depots.operations.parId(rendu.id);
		const corriger = (montant: number) =>
			i.app.operations.modifier(i.ctx(), {
				id: rendu.id,
				version: op?.version ?? 0,
				saisie: saisie('depense', montant)
			});
		expect(code(corriger(150_00))).toBe('rendu_excessif');
		expect(code(corriger(100_00))).toBeNull();
	});

	it('après un Avoir, l’encaissement ne s’annule pas tant que la Dette court', async () => {
		quand('2026-10-05');
		const factures = i.app.factures;
		const id = valeur(
			factures.creer(i.ctx(), {
				tiersNom: 'Cantine fictive',
				tiersAdresse: '',
				dateEmission: '2026-10-05',
				actionId: null,
				lignes: [{ designation: 'Repas', quantite: 10, prixUnitaire: c(10_00) }]
			})
		).id;
		valeur(await factures.valider(i.ctx(), id));
		const creance = j().creancesDettes.find((x) => x.sens === 'creance');
		const reglement = valeur(
			i.app.creances.solder(i.ctx(), {
				parts: [{ creanceId: creance?.id as number, montant: c(40_00) }],
				saisie: i.saisie('recette', 40_00, { date: '2026-10-06' })
			})
		);
		quand('2026-10-07');
		valeur(await factures.creerAvoir(i.ctx(), id));
		quand('2026-10-08');
		expect(code(i.app.operations.annuler(i.ctx(), reglement.id))).toBe(
			'reglement_repris_par_avoir'
		);
		const dette = j().creancesDettes.find((x) => x.sens === 'dette' && x.annuleeLe === null);
		valeur(i.app.creances.annuler(i.ctx(), dette?.id as number));
		expect(code(i.app.operations.annuler(i.ctx(), reglement.id))).toBeNull();
	});

	it('une ancre posée sur l’Exercice suivant ne change pas l’Exercice clôturé', () => {
		quand('2027-09-02');
		valeur(i.app.exercices.cloturer(i.ctx(), i.courant.id));
		const id = valeur(
			i.app.parametrage.creerCompte(i.ctx(), { libelle: 'Livret', type: 'epargne' } as never)
		);
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		quand('2028-09-02');
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		const de = (annee: number) => exercices().find((e) => e.anneeDebut === annee);
		const n1 = de(2027);
		if (!n1) throw new Error('Exercice absent');
		valeur(i.app.exercices.cloturer(i.ctx(), n1.id));
		const clos = () => {
			const e = exercices().find((x) => x.id === n1.id) as typeof n1;
			return etatTresorerie(j(), e, parametrageDe(i.app.socle.depots, e));
		};
		const avant = clos();
		valeur(
			i.app.exercices.enregistrerBalance(i.ctx(), {
				exerciceId: de(2028)?.id as number,
				soldes: [{ compteId: id, solde: c(500_00) }]
			})
		);
		expect(clos()).toEqual(avant);
		expect(valeur(i.app.etats.verifier(i.ctx()))).toEqual([]);
		expect(soldeCompte(j(), id, '2029-01-01')).toBe(500_00);
	});
});

describe('tentatives de mot de passe', () => {
	it('le mot de passe actuel se teste sous la même limite que la connexion (AD-14)', async () => {
		const b = banc('2026-11-04T10:00:00.000Z');
		const essai = (actuel: string) =>
			b.app.acces.changerMotDePasse(b.ctx(), {
				actuel,
				nouveau: 'nouveau-mot-de-passe-long',
				adresse: '203.0.113.7'
			});
		for (let n = 0; n < 10; n++) expect(code(await essai('faux'))).toBe('mot_de_passe_faux');
		expect(code(await essai('faux'))).toBe('trop_de_tentatives');
		expect(code(await essai('mot-de-passe-long'))).toBe('trop_de_tentatives');
	});

	it('`ape reinitialiser-acces` lève le blocage d’un identifiant', async () => {
		const b = banc('2026-11-04T10:00:00.000Z');
		const ctx = b.app.ctx(null);
		const essai = (motDePasse: string, n: number) =>
			b.app.acces.connecter(ctx, { identifiant: 'camille', motDePasse, adresse: `203.0.113.${n}` });
		for (let n = 0; n < 10; n++) await essai('faux', n);
		expect(code(await essai('mot-de-passe-long', 50))).toBe('trop_de_tentatives');
		const lien = valeur(b.app.acces.reinitialiser(ctx, 'camille'));
		const nouveau = 'nouveau-mot-de-passe-long';
		valeur(await b.app.acces.accepterInvitation(ctx, { jeton: lien, motDePasse: nouveau }));
		expect(code(await essai(nouveau, 51))).toBeNull();
	});
});
