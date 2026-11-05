import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resteDu } from '#lib/domaine/creances/index.ts';
import { compteDeResultat } from '#lib/domaine/etats/resultat.ts';
import type { EntreeFacture } from '#lib/domaine/factures/index.ts';
import { centimes as c } from '#lib/domaine/montant.ts';
import { parametrageCourant } from '#lib/server/application/etats/index.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { appliquerMigrations, chargerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';
import { instancePrete, valeur } from './aides/instance.ts';

let i: ReturnType<typeof instancePrete>;
const factures = () => i.app.factures;
const j = () => i.app.socle.depots.operations.journal();
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);
const compter = (table: string) =>
	i.base.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;

const saisie = (partiel: Partial<EntreeFacture> = {}): EntreeFacture => ({
	tiersNom: 'Cantine fictive',
	tiersAdresse: '1 rue Fictive',
	dateEmission: '2026-11-02',
	actionId: null,
	lignes: [{ designation: 'Repas fictifs', quantite: 20, prixUnitaire: c(5_00) }],
	...partiel
});

const brouillon = (partiel: Partial<EntreeFacture> = {}) =>
	valeur(factures().creer(i.ctx(), saisie(partiel))).id;

async function validee(partiel: Partial<EntreeFacture> = {}) {
	return valeur(await factures().valider(i.ctx(), brouillon(partiel)));
}

function encaisser(creanceId: number, montant: number, date = '2026-11-03') {
	return valeur(
		i.app.creances.solder(i.ctx(), {
			parts: [{ creanceId, montant: c(montant) }],
			saisie: i.saisie('recette', montant, { date })
		})
	);
}

const creanceDe = (factureId: number) =>
	j().creancesDettes.find((x) => x.factureId === factureId && x.sens === 'creance')!;

const verifier = () => valeur(i.app.etats.verifier(i.ctx())).map((v) => v.message);

beforeEach(() => {
	i = instancePrete();
});

describe('brouillon (F4, story 9.1)', () => {
	it('ne porte aucun numéro, ne produit ni Ligne ni Créance', () => {
		const id = brouillon();
		const { facture, total, etat } = valeur(factures().detail(i.ctx(), id));
		expect(facture.numero).toBeNull();
		expect(total).toBe(100_00);
		expect(etat).toBe('brouillon');
		expect(compter('compteur_facture')).toBe(0);
		expect(compter('creance_dette')).toBe(0);
		expect(compter('ligne')).toBe(0);
	});

	it('se modifie, se remplace ligne à ligne, et le Journal le dit', () => {
		const id = brouillon();
		valeur(
			factures().modifier(
				i.ctx(),
				id,
				saisie({ lignes: [{ designation: 'Goûters', quantite: 2, prixUnitaire: c(1_00) }] })
			)
		);
		expect(valeur(factures().detail(i.ctx(), id)).total).toBe(2_00);
		expect(i.journal().map((l) => l.evenement)).toContain('facture.brouillon_modifie');
	});

	it('se supprime librement, sans consommer de numéro', async () => {
		const id = brouillon();
		valeur(factures().supprimer(i.ctx(), id));
		expect(compter('facture')).toBe(0);
		expect(compter('facture_ligne')).toBe(0);
		expect((await validee()).numero).toBe('2026-001');
	});

	it('refuse une Action désactivée, garde celle déjà choisie', () => {
		const id = brouillon({ actionId: i.actionId });
		i.app.socle.depots.parametrage.activerAction(i.actionId, false);
		expect(factures().modifier(i.ctx(), id, saisie({ actionId: i.actionId })).ok).toBe(true);
		expect(code(factures().creer(i.ctx(), saisie({ actionId: i.actionId })))).toBe(
			'reference_inactive'
		);
	});

	it('un·e lecteur·rice n’y accède pas', () => {
		const lecteur = () => ({ ...i.ctx(), acces: { ...i.tresorier, role: 'lecteur' as const } });
		expect(code(factures().liste(lecteur(), null))).toBe('acces_refuse');
		expect(code(factures().creer(lecteur(), saisie()))).toBe('acces_refuse');
	});

	it('la liste suit l’Exercice regardé, les brouillons restent', async () => {
		brouillon({ dateEmission: null });
		await validee();
		expect(valeur(factures().liste(i.ctx(), i.courant))).toHaveLength(2);
		expect(valeur(factures().liste(i.ctx(), i.repere))).toHaveLength(2);
		const passe = { ...i.courant, debut: '2025-09-01', fin: '2026-08-31' };
		expect(valeur(factures().liste(i.ctx(), passe)).map((f) => f.etat)).toEqual(['brouillon']);
	});
});

describe('validation (F3, story 9.2)', () => {
	it('attribue le numéro, fige l’identité, stocke le PDF, crée la Créance', async () => {
		i.app.parametrage.enregistrerAssociation(i.ctx(), {
			nom: 'APE des Tilleuls',
			adresse: '2 rue Fictive',
			moisDebutExercice: 9,
			mentionsFacture: 'TVA non applicable'
		});
		const { id, numero } = await validee({ actionId: i.actionId });
		expect(numero).toBe('2026-001');

		const { facture } = valeur(factures().detail(i.ctx(), id));
		expect(facture.identite).toEqual({
			nom: 'APE des Tilleuls',
			adresse: '2 rue Fictive',
			mentions: 'TVA non applicable'
		});
		expect(facture.fichierSha256).not.toBeNull();
		expect(i.fichiers.get(facture.fichierSha256!)?.slice(0, 5)).toEqual(
			new TextEncoder().encode('%PDF-')
		);
		expect(creanceDe(id)).toMatchObject({
			sens: 'creance',
			tiers: 'Cantine fictive',
			motif: 'Facture n° 2026-001',
			montant: 100_00,
			date: '2026-11-02',
			actionId: i.actionId
		});
		expect(compter('ligne')).toBe(0);
		expect(verifier()).toEqual([]);
	});

	it('changer les Réglages ne touche plus au document', async () => {
		const { id } = await validee();
		const avant = valeur(factures().fichier(i.ctx(), id)).octets;
		i.app.parametrage.enregistrerAssociation(i.ctx(), {
			nom: 'Autre nom',
			adresse: '',
			moisDebutExercice: 9,
			mentionsFacture: 'Autre mention'
		});
		expect(valeur(factures().fichier(i.ctx(), id)).octets).toEqual(avant);
		expect(valeur(factures().detail(i.ctx(), id)).facture.identite?.nom).toBe('APE des Tilleuls');
	});

	it('le PDF se génère une fois : relire ne le refait pas', async () => {
		const pdf = vi.spyOn(i.app.socle.exporteurs, 'pdf');
		const { id } = await validee();
		factures().fichier(i.ctx(), id);
		factures().fichier(i.ctx(), id);
		expect(pdf).toHaveBeenCalledTimes(1);
	});

	it('refuse une date antérieure à la dernière émise', async () => {
		await validee({ dateEmission: '2026-11-03' });
		const r = await factures().valider(i.ctx(), brouillon({ dateEmission: '2026-11-02' }));
		expect(code(r)).toBe('facture_date_anterieure');
	});

	it('aucun numéro ne manque ni ne se répète, au fil des échecs', async () => {
		const numeros: string[] = [];
		const dates = ['2026-11-01', '2026-11-02', '2026-11-02', '2026-11-03', '2026-11-04'];
		for (const [n, date] of dates.entries()) {
			// Un refus de date, une Facture vide, puis une panne du PDF, intercalés à chaque tour.
			expect(
				code(await factures().valider(i.ctx(), brouillon({ dateEmission: '2026-05-01' })))
			).toBe('date_hors_exercice');
			expect(code(await factures().valider(i.ctx(), brouillon({ lignes: [] })))).toBe(
				'facture_sans_montant'
			);
			const panne = vi
				.spyOn(i.app.socle.exporteurs, 'pdf')
				.mockRejectedValueOnce(new Error('panne fictive'));
			await expect(
				factures().valider(i.ctx(), brouillon({ dateEmission: date }))
			).rejects.toThrow();
			panne.mockRestore();
			numeros.push((await validee({ dateEmission: date })).numero);
			expect(numeros).toHaveLength(n + 1);
		}
		expect(numeros).toEqual(['2026-001', '2026-002', '2026-003', '2026-004', '2026-005']);
		expect(verifier()).toEqual([]);
	});

	it('deux validations en même temps prennent deux numéros qui se suivent', async () => {
		const a = brouillon();
		const b = brouillon();
		const [ra, rb] = await Promise.all([
			factures().valider(i.ctx(), a),
			factures().valider(i.ctx(), b)
		]);
		expect([valeur(ra).numero, valeur(rb).numero].sort()).toEqual(['2026-001', '2026-002']);
		const pdfA = valeur(factures().detail(i.ctx(), a));
		expect(i.fichiers.get(pdfA.facture.fichierSha256!)).toBeDefined();
		expect(verifier()).toEqual([]);
	});

	it('une Facture validée ne se modifie plus, et son PDF ne devient jamais orphelin', async () => {
		const { id } = await validee();
		expect(code(factures().modifier(i.ctx(), id, saisie()))).toBe('facture_validee');
		expect(code(factures().supprimer(i.ctx(), id))).toBe('facture_validee');
		expect(code(await factures().valider(i.ctx(), id))).toBe('facture_validee');
		const sha = valeur(factures().detail(i.ctx(), id)).facture.fichierSha256!;
		expect(i.app.socle.depots.factures.fichiers()).toEqual([sha]);
	});

	it('un PDF disparu se signale à `ape verifier`', async () => {
		const { id } = await validee();
		i.fichiers.delete(valeur(factures().detail(i.ctx(), id)).facture.fichierSha256!);
		expect(verifier()).toEqual(['Le PDF de 2026-001 est absent.']);
	});

	it('une Créance de Facture ne s’annule ni ne se rétablit hors de l’Avoir', async () => {
		const { id } = await validee();
		expect(code(i.app.creances.annuler(i.ctx(), creanceDe(id).id))).toBe('creance_de_facture');
	});
});

describe('encaissement au Pointage (story 9.2)', () => {
	function ligneDeRelevé(montant: number, libelle: string) {
		valeur(
			i.app.pointage.saisirLigne(i.ctx(), {
				compteId: i.compteId,
				date: '2026-11-04',
				montant: c(montant),
				libelle
			})
		);
		return j().lignesReleve.at(-1)!;
	}

	const vue = () => valeur(i.app.pointage.page(i.ctx(), i.compteId, null));

	it('le volet signale la Créance, sans rien solder ni pointer', async () => {
		const { id } = await validee();
		const ligne = ligneDeRelevé(100_00, 'VIR CANTINE 2026-001');
		const active = vue().lignes.find((l) => l.id === ligne.id)!;
		expect(active.sommes).toEqual([
			expect.objectContaining({
				creanceId: creanceDe(id).id,
				numero: '2026-001',
				raison: 'Même montant, n° de facture lu dans le libellé'
			})
		]);
		expect(compter('reglement')).toBe(0);
		expect(compter('pointage')).toBe(0);
	});

	it('créer depuis la ligne solde et pointe ensemble, et la recette ne compte qu’alors', async () => {
		const { id } = await validee();
		const creanceId = creanceDe(id).id;
		const ligne = ligneDeRelevé(100_00, 'VIR CANTINE 2026-001');
		const resultat = () =>
			compteDeResultat(j(), i.courant, parametrageCourant(i.app.socle.depots)).resultat;
		expect(resultat()).toBe(0);

		const r = valeur(
			i.app.pointage.creerDepuisLigne(i.ctx(), {
				ligneId: ligne.id,
				saisie: i.saisie('recette', 100_00, { date: ligne.date }),
				parts: [{ creanceId, montant: c(100_00) }]
			})
		);
		expect(r.pointageId).not.toBeNull();
		expect(resteDu(creanceDe(id), j(), '2026-11-04')).toBe(0);
		expect(resultat()).toBe(100_00);
		expect(valeur(factures().detail(i.ctx(), id)).detail).toBe('encaissée');
		expect(vue().lignes[0]?.sommes).toEqual([]);
	});

	it('un refus laisse Opération, règlement et Pointage de côté', async () => {
		const { id } = await validee();
		const ligne = ligneDeRelevé(150_00, 'VIR CANTINE 2026-001');
		const r = i.app.pointage.creerDepuisLigne(i.ctx(), {
			ligneId: ligne.id,
			saisie: i.saisie('recette', 150_00, { date: ligne.date }),
			parts: [{ creanceId: creanceDe(id).id, montant: c(120_00) }]
		});
		expect(code(r)).toBe('reglement_excessif');
		expect(compter('operation')).toBe(0);
		expect(compter('reglement')).toBe(0);
		expect(compter('pointage')).toBe(0);
	});

	it('un encaissement partiel laisse le reste à recevoir', async () => {
		const { id } = await validee();
		const ligne = ligneDeRelevé(40_00, 'ACOMPTE 2026-001');
		valeur(
			i.app.pointage.creerDepuisLigne(i.ctx(), {
				ligneId: ligne.id,
				saisie: i.saisie('recette', 40_00, { date: ligne.date }),
				parts: [{ creanceId: creanceDe(id).id, montant: c(40_00) }]
			})
		);
		expect(valeur(factures().detail(i.ctx(), id)).detail).toMatch(/^reste 60,00/);
	});
});

describe('Avoir (F5, story 9.3)', () => {
	it('annule une Facture non encaissée : reste dû à 0, aucune Dette', async () => {
		const { id } = await validee();
		const avoir = valeur(await factures().creerAvoir(i.ctx(), id));
		expect(avoir.numero).toBe('2026-002');
		expect(resteDu(creanceDe(id), j(), '2026-11-04')).toBe(0);
		expect(j().creancesDettes.filter((x) => x.sens === 'dette')).toEqual([]);
		expect(compter('ligne')).toBe(0);

		const vue = valeur(factures().detail(i.ctx(), avoir.id));
		expect(vue.etat).toBe('avoir');
		expect(vue.total).toBe(100_00);
		expect(vue.facture.fichierSha256).not.toBeNull();
		expect(vue.origine).toEqual({ id, numero: '2026-001' });
		expect(valeur(factures().detail(i.ctx(), id)).etat).toBe('annulee');
		expect(verifier()).toEqual([]);
	});

	it('une Facture encaissée en partie ouvre une Dette du montant encaissé', async () => {
		const { id } = await validee();
		encaisser(creanceDe(id).id, 30_00);
		const avoir = valeur(await factures().creerAvoir(i.ctx(), id));
		expect(j().creancesDettes.find((x) => x.sens === 'dette')).toMatchObject({
			tiers: 'Cantine fictive',
			motif: 'Avoir n° 2026-002',
			montant: 30_00,
			date: '2026-11-04',
			factureId: avoir.id
		});
		expect(resteDu(creanceDe(id), j(), '2026-11-04')).toBe(0);
	});

	it('une Facture encaissée en entier ouvre une Dette de tout son montant', async () => {
		const { id } = await validee();
		encaisser(creanceDe(id).id, 100_00);
		valeur(await factures().creerAvoir(i.ctx(), id));
		expect(j().creancesDettes.find((x) => x.sens === 'dette')?.montant).toBe(100_00);
	});

	it('l’Avoir suit la numérotation de sa propre année, à sa propre date', async () => {
		const { id } = await validee();
		i.horloge.instant = '2027-01-03T10:00:00.000Z';
		const avoir = valeur(await factures().creerAvoir(i.ctx(), id));
		expect(avoir.numero).toBe('2027-001');
	});

	it('se refuse deux fois, et sur un Avoir', async () => {
		const { id } = await validee();
		const avoir = valeur(await factures().creerAvoir(i.ctx(), id));
		expect(code(await factures().creerAvoir(i.ctx(), id))).toBe('facture_deja_annulee');
		expect(code(await factures().creerAvoir(i.ctx(), avoir.id))).toBe('element_introuvable');
	});

	it('son aperçu n’écrit rien', async () => {
		const { id } = await validee();
		const avant = compter('facture');
		const a = valeur(factures().apercuAvoir(i.ctx(), id));
		expect(a).toMatchObject({ resteAnnule: 100_00, detteOuverte: 0, numero: '2026-002' });
		expect(a.modele.provisoire).toBe(true);
		expect(compter('facture')).toBe(avant);
	});

	it('la Créance annulée ne se rétablit pas', async () => {
		const { id } = await validee();
		const creance = creanceDe(id);
		valeur(await factures().creerAvoir(i.ctx(), id));
		expect(code(i.app.creances.retablir(i.ctx(), creance.id))).toBe('creance_de_facture');
	});

	it('la Dette ouverte reste une Dette ordinaire, qui se paie', async () => {
		const { id } = await validee();
		encaisser(creanceDe(id).id, 30_00);
		valeur(await factures().creerAvoir(i.ctx(), id));
		const dette = j().creancesDettes.find((x) => x.sens === 'dette')!;
		valeur(
			i.app.creances.solder(i.ctx(), {
				parts: [{ creanceId: dette.id, montant: c(30_00) }],
				saisie: i.saisie('depense', 30_00, { date: '2026-11-04' })
			})
		);
		const relue = j().creancesDettes.find((x) => x.id === dette.id)!;
		expect(resteDu(relue, j(), '2026-11-04')).toBe(0);
	});
});

describe('jalon 2 vers jalon 3', () => {
	it('la migration ne change aucune donnée', () => {
		const migrations = chargerMigrations('migrations');
		const horodatage = '2026-11-04T10:00:00.000Z';
		const base = ouvrirBase(':memory:');
		appliquerMigrations(
			base,
			migrations.filter((m) => m.nom < '0004'),
			{ horodatage }
		);
		base.exec(`
			INSERT INTO acces (id, identifiant, nom_affiche, role, cree_le)
				VALUES (1, 'test', 'Personne fictive', 'tresorier', '2025-09-01T08:00:00.000Z');
			INSERT INTO creance_dette (id, sens, tiers, motif, montant_centimes, date, cree_le, cree_par)
				VALUES (1, 'creance', 'Mairie fictive', 'Subvention', 50000, '2026-02-01', '2026-02-01', 1);
		`);
		const tables = base
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
			.pluck()
			.all() as string[];
		const instantane = () =>
			Object.fromEntries(
				tables
					.filter((t) => t !== 'schema_migrations')
					.map((t) => [
						t,
						base
							.prepare(`SELECT * FROM ${t}`)
							.all()
							.map((rangee) => {
								const { facture_id: nouvelle, ...reste } = rangee as Record<string, unknown>;
								expect(nouvelle ?? null).toBeNull();
								return reste;
							})
					])
			);
		const avant = instantane();
		appliquerMigrations(base, migrations, { horodatage });
		expect(instantane()).toEqual(avant);
	});
});
