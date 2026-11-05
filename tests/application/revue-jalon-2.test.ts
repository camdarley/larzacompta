/**
 * Non-régression des défauts trouvés par la revue indépendante du jalon 2.
 * Chaque cas rejoue la preuve relevée (P1 à P14), de bout en bout dans l'application.
 */
import { strFromU8, unzipSync } from 'fflate';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { soldeCourantCaisse, termesRecette } from '#lib/domaine/caisse/index.ts';
import { chequesARemettre } from '#lib/domaine/etats/controle.ts';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type { CoupureJ } from '#lib/domaine/journal.ts';
import { centimes as c, MONTANT_MAX, type Centimes } from '#lib/domaine/montant.ts';
import { chequeAbsent } from '#lib/domaine/releve/cheques.ts';
import { lireMontantCsv, type ReglageCsv } from '#lib/domaine/releve/csv.ts';
import type { PhaseSession } from '#lib/domaine/journal.ts';
import { creerJournaliseur } from '#lib/server/infra/logs.ts';
import { demarrerMinuteur } from '#lib/server/infra/minuteur.ts';
import { sourceCsv } from '#lib/server/infra/sources/csv.ts';
import { sourceOfx } from '#lib/server/infra/sources/ofx.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { instanceFictive, type InstanceFictive } from './aides/fictive.ts';
import { instancePrete, valeur } from './aides/instance.ts';

type Instance = ReturnType<typeof instancePrete>;

const JOUR = '2026-10-10';
const billets = (n: number): CoupureJ[] => [{ coupure: c(1000), quantite: n }];
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? null : r.erreur?.code);

let i: Instance;
let caisse: number;
let reserve: number;

const j = () => i.app.socle.depots.operations.journal();
const verifier = () => valeur(i.app.etats.verifier(i.ctx())).map((v) => v.message);
const recette = (s: number) => termesRecette(j(), s)?.recette;
const quand = (jour: string) => {
	i.horloge.instant = `${jour}T18:00:00.000Z`;
};

function creerCaisse(libelle: string, solde: number, estReserve = false) {
	return valeur(
		i.app.parametrage.creerCompte(i.ctx(), {
			libelle,
			type: 'caisse',
			reserve: estReserve,
			ancre: { exerciceId: i.courant.id, solde: c(solde) }
		})
	);
}

function ouvrir(dizaines: number, date = JOUR, confirmation: Centimes | null = null) {
	const r = i.app.caisses.compterCaisse(i.ctx(), {
		compteId: caisse,
		actionId: i.actionId,
		coupures: billets(dizaines),
		date,
		confirmation
	});
	return valeur(r).sessionId as number;
}

const compter = (
	id: number,
	dizaines: number,
	date: string,
	corriger = false,
	confirmation: Centimes | null = null
) =>
	i.app.caisses.compterSession(i.ctx(), {
		sessionId: id,
		coupures: billets(dizaines),
		date,
		confirmation,
		corriger
	});

function depense(montant: number, date: string, phases?: Record<string, PhaseSession>) {
	return valeur(
		i.app.operations.creer(i.ctx(), {
			...i.saisie('depense', montant, { compteId: caisse, date, modePaiement: 'especes' }),
			phases
		})
	).id;
}

function transfert(montant: number, jour: string, phases?: Record<string, PhaseSession>) {
	return valeur(
		i.app.operations.creer(i.ctx(), {
			forme: 'interne',
			libelle: 'Vers la réserve',
			note: null,
			reference: null,
			deId: caisse,
			versId: reserve,
			montant: c(montant),
			parti: jour,
			arrive: jour,
			phases
		})
	).id;
}

function renommer(id: number, montant: number, date: string) {
	const op = i.app.socle.depots.operations.parId(id)!;
	return i.app.operations.modifier(i.ctx(), {
		id,
		version: op.version,
		saisie: {
			...i.saisie('depense', montant, { compteId: caisse, date, modePaiement: 'especes' }),
			libelle: 'Libellé corrigé'
		}
	});
}

const cote = (id: number) => i.app.socle.depots.operations.parId(id)!.cotes[0]!;

beforeEach(() => {
	i = instancePrete();
	quand('2026-09-15');
	valeur(
		i.app.parametrage.modifierAction(i.ctx(), {
			id: i.actionId,
			libelle: 'Kermesse',
			groupeId: i.app.socle.depots.parametrage.groupes()[0]!.id,
			avecCaisse: true
		})
	);
	caisse = creerCaisse('Caisse fictive', 100_00);
	reserve = creerCaisse('Réserve fictive', 0, true);
});

describe('corriger le texte ne rattache rien à la Session ouverte (P1, P2, AD-10)', () => {
	it('P1 : un ticket ancien reste hors Session, et la Recette ne bouge pas', () => {
		quand('2026-09-20');
		const id = depense(30_00, '2026-09-20');
		quand(JOUR);
		const s = ouvrir(7);
		valeur(compter(s, 17, JOUR));
		valeur(renommer(id, 30_00, '2026-09-20'));
		expect(cote(id).sessionCaisseId ?? null).toBeNull();
		expect(recette(s)).toBe(100_00);
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(soldeCompte(j(), caisse, JOUR)).toBe(170_00);
		expect(soldeCourantCaisse(j(), caisse, { jour: JOUR })).toBe(170_00);
		expect(verifier()).toEqual([]);
	});

	it('P2 : un Côté d’une Session close garde sa Session', () => {
		quand(JOUR);
		const s1 = ouvrir(10);
		const id = depense(20_00, JOUR);
		valeur(compter(s1, 18, JOUR));
		valeur(i.app.caisses.cloturer(i.ctx(), s1));
		quand('2026-10-12');
		const s2 = ouvrir(18, '2026-10-12');
		valeur(compter(s2, 18, '2026-10-12'));
		valeur(renommer(id, 20_00, JOUR));
		expect(cote(id).sessionCaisseId).toBe(s1);
		expect(recette(s2)).toBe(0);
		expect(verifier()).toEqual([]);
	});

	it('T9 : un Mouvement interne ancien non plus', () => {
		quand('2026-09-20');
		const id = transfert(50_00, '2026-09-20');
		quand(JOUR);
		const s = ouvrir(5);
		valeur(compter(s, 25, JOUR));
		const op = i.app.socle.depots.operations.parId(id)!;
		valeur(
			i.app.operations.modifier(i.ctx(), {
				id,
				version: op.version,
				saisie: {
					forme: 'interne',
					libelle: 'Vers la réserve, corrigé',
					note: null,
					reference: null,
					deId: caisse,
					versId: reserve,
					montant: c(50_00),
					parti: '2026-09-20',
					arrive: '2026-09-20'
				}
			})
		);
		expect(cote(id).sessionCaisseId ?? null).toBeNull();
		expect(recette(s)).toBe(200_00);
	});

	it('un Côté dont le montant change suit toujours la Session ouverte', () => {
		quand(JOUR);
		const s = ouvrir(10);
		const id = depense(10_00, JOUR);
		valeur(renommer(id, 15_00, JOUR));
		expect(cote(id).sessionCaisseId).toBe(s);
		expect(cote(id).sessionPhase).toBe('pendant');
	});
});

describe('la phase suit le Comptage final (P3, P4, AD-10)', () => {
	it('P3 : le final saisi après coup repasse le transfert du lendemain après le Comptage', () => {
		quand(JOUR);
		const s = ouvrir(10);
		quand('2026-10-11');
		const id = transfert(100_00, '2026-10-11');
		expect(cote(id).sessionPhase).toBe('pendant');
		quand('2026-10-12');
		valeur(compter(s, 50, JOUR));
		expect(cote(id).sessionPhase).toBe('apres_comptage');
		expect(recette(s)).toBe(400_00);
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(soldeCompte(j(), caisse, '2026-10-12')).toBe(400_00);
		expect(soldeCourantCaisse(j(), caisse, { jour: '2026-10-12' })).toBe(400_00);
		expect(verifier()).toEqual([]);
	});

	it('P4 : un final corrigé à plus tard ramène pendant ce qui le précède désormais', () => {
		quand(JOUR);
		const s = ouvrir(10);
		valeur(compter(s, 50, JOUR));
		const id = transfert(100_00, JOUR, { [caisse]: 'apres_comptage' });
		expect(recette(s)).toBe(400_00);
		quand('2026-10-11');
		valeur(compter(s, 50, '2026-10-11', true));
		expect(cote(id).sessionPhase).toBe('pendant');
		expect(recette(s)).toBe(500_00);
	});

	it('le même jour que le final, la réponse donnée au formulaire reste', () => {
		quand(JOUR);
		const s = ouvrir(10);
		valeur(compter(s, 50, JOUR));
		const id = transfert(100_00, JOUR, { [caisse]: 'pendant' });
		valeur(compter(s, 51, JOUR, true));
		expect(cote(id).sessionPhase).toBe('pendant');
	});

	it('ape verifier relève une phase contraire à la date du Côté', () => {
		quand(JOUR);
		const s = ouvrir(10);
		const id = depense(10_00, JOUR);
		valeur(compter(s, 20, JOUR));
		expect(verifier()).toEqual([]);
		i.app.socle.depots.operations.definirPhaseCote(cote(id).id, 'apres_comptage');
		expect(verifier()).toEqual([]);
		quand('2026-10-11');
		valeur(compter(s, 20, '2026-10-11', true));
		expect(cote(id).sessionPhase).toBe('pendant');
		i.app.socle.depots.operations.definirPhaseCote(cote(id).id, 'apres_comptage');
		expect(verifier()).toEqual([`Opération ${id} : phase contraire à sa date.`]);
	});
});

describe('un ticket antérieur au Comptage d’ouverture (P5)', () => {
	function scenario() {
		quand(JOUR);
		const s = ouvrir(8, JOUR, c(80_00));
		expect(j().operations.filter((o) => o.origine === 'ecart_caisse')).toHaveLength(1);
		return s;
	}

	it('n’entre pas dans C5, et l’Écart fictif disparaît', () => {
		const s = scenario();
		const id = depense(20_00, '2026-10-05');
		expect(cote(id).sessionCaisseId ?? null).toBeNull();
		expect(j().operations.filter((o) => o.origine === 'ecart_caisse')).toEqual([]);
		valeur(compter(s, 28, JOUR));
		expect(recette(s)).toBe(200_00);
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(soldeCompte(j(), caisse, JOUR)).toBe(280_00);
		expect(soldeCourantCaisse(j(), caisse, { jour: JOUR })).toBe(280_00);
		expect(verifier()).toEqual([]);
	});

	it('laisse le reste de l’Écart si le ticket ne l’explique qu’en partie', () => {
		scenario();
		depense(5_00, '2026-10-05');
		const ecarts = j().operations.filter((o) => o.origine === 'ecart_caisse');
		expect(ecarts.map((o) => o.cotes[0]!.montant)).toEqual([-15_00]);
		expect(i.app.socle.depots.operations.journal().comptages[0]!.operationEcartId).toBe(
			ecarts[0]!.id
		);
	});

	it('annulé, le ticket rend son Écart à l’ouverture', () => {
		scenario();
		const id = depense(20_00, '2026-10-05');
		valeur(i.app.operations.annuler(i.ctx(), id));
		expect(
			j()
				.operations.filter((o) => o.origine === 'ecart_caisse')
				.map((o) => o.cotes[0]!.montant)
		).toEqual([-20_00]);
	});

	it('corriger l’ouverture tient compte du ticket en retard', () => {
		const s = scenario();
		depense(5_00, '2026-10-05');
		valeur(compter(s, 9, JOUR, true, c(90_00)));
		const ecarts = j().operations.filter((o) => o.origine === 'ecart_caisse');
		expect(ecarts.map((o) => o.cotes[0]!.montant)).toEqual([-5_00]);
	});
});

describe('date d’un Comptage d’ouverture corrigé (P6)', () => {
	it('refuse de remonter avant le Comptage précédent de la caisse', () => {
		quand('2026-10-05');
		const s1 = ouvrir(10, '2026-10-05');
		valeur(compter(s1, 30, '2026-10-05'));
		valeur(i.app.caisses.cloturer(i.ctx(), s1));
		quand('2026-10-12');
		const s2 = ouvrir(30, '2026-10-12');
		const r = compter(s2, 10, '2026-10-01', true, c(100_00));
		expect(code(r)).toBe('comptage_date_anterieure');
		expect(compter(s2, 30, '2026-10-06', true).ok).toBe(true);
	});

	it('reste libre pour la première Session d’une caisse', () => {
		quand(JOUR);
		const s = ouvrir(10);
		expect(compter(s, 10, '2026-10-08', true).ok).toBe(true);
	});
});

describe('Action désactivée (P9)', () => {
	it('la Session se clôture quand même', () => {
		quand(JOUR);
		const s = ouvrir(10);
		valeur(compter(s, 30, JOUR));
		i.app.socle.depots.parametrage.activerAction(i.actionId, false);
		expect(i.app.caisses.cloturer(i.ctx(), s).ok).toBe(true);
	});
});

describe('ape verifier et réouverture (P11)', () => {
	it('une dépense saisie entre deux clôtures n’est pas un faux C12', () => {
		quand(JOUR);
		const s = ouvrir(10);
		valeur(compter(s, 30, JOUR));
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		quand('2026-10-11');
		depense(10_00, '2026-10-11');
		quand('2026-10-12');
		valeur(i.app.caisses.rouvrir(i.ctx(), s));
		valeur(i.app.caisses.cloturer(i.ctx(), s));
		expect(verifier()).toEqual([]);
	});

	it('une Session jamais rouverte garde son contrôle', () => {
		quand(JOUR);
		ouvrir(10);
		quand('2026-10-11');
		const id = depense(10_00, '2026-10-11');
		i.base
			.prepare('UPDATE cote SET session_caisse_id = NULL, session_phase = NULL WHERE id = ?')
			.run(cote(id).id);
		expect(verifier()).toEqual([`Opération ${id} : hors de la Session ouverte.`]);
	});
});

describe('relevé (P8, défauts CSV, FR-12, AD-9)', () => {
	const utf8 = (t: string) => new TextEncoder().encode(t);
	const reglage: ReglageCsv = {
		date: 'Date',
		libelle: 'Libellé',
		identifiant: null,
		montant: { mode: 'unique', colonne: 'Montant' }
	};
	const lire = (texte: string) => sourceCsv.lire({ octets: utf8(texte), reglage } as never);
	const entete = 'Date;Libellé;Montant;Solde\n';

	it('P8 : une rangée sans la colonne inutile se lit', () => {
		const r = valeur(
			lire(
				`${entete}01/10/2026;PRLV A;-10,00;90,00\n02/10/2026;PRLV B;-20,00\n03/10/2026;PRLV C;-5,00;65,00\n`
			)
		);
		expect(r.lignes.map((l) => l.montant)).toEqual([-10_00, -20_00, -5_00]);
	});

	it('une dernière rangée coupée avant son montant refuse tout le fichier', () => {
		expect(
			code(
				lire(
					`${entete}01/10/2026;ACHAT UN;-1,00;1,00\n02/10/2026;ACHAT DEUX;-2,00;3,00\n14/10/2026;ACHAT TRONQ`
				)
			)
		).toBe('fichier_illisible');
	});

	it('une date coupée en fin de fichier aussi', () => {
		expect(
			code(lire(`${entete}01/10/2026;ACHAT UN;-1,00;1,00\n02/10/2026;ACHAT DEUX;-2,00;3,00\n14/1`))
		).toBe('fichier_illisible');
	});

	it('une rangée courte au milieu des données aussi', () => {
		expect(
			code(lire(`${entete}01/10/2026;A;-1,00;1,00\nsuite du libellé\n02/10/2026;B;-2,00;3,00\n`))
		).toBe('fichier_illisible');
	});

	it('un pied de fichier sans date ne compte pas', () => {
		const r = valeur(
			lire(`${entete}01/10/2026;A;-1,00;1,00\n02/10/2026;B;-2,00;3,00\nTotal;-3,00\n`)
		);
		expect(r.lignes).toHaveLength(2);
	});

	it('une rangée de total entière reste ignorée, une date illisible refuse', () => {
		expect(
			valeur(lire(`${entete}01/10/2026;A;-1,00;1,00\n;Total;-1,00;1,00\n`)).lignes
		).toHaveLength(1);
		expect(code(lire(`${entete}01/10/2026;A;-1,00;1,00\n99/99/2026;B;-1,00;1,00\n`))).toBe(
			'fichier_illisible'
		);
	});

	it('refuse un montant au-delà du plafond de la saisie', () => {
		expect(lireMontantCsv('100000000,00')).toBe(MONTANT_MAX);
		expect(lireMontantCsv('100000000,01')).toBeNull();
		expect(lireMontantCsv('-12345678901234')).toBeNull();
		expect(code(lire(`${entete}01/10/2026;A;12345678901234;1,00\n`))).toBe('fichier_illisible');
	});

	it('refuse aussi un TRNAMT ou un solde démesuré en OFX', () => {
		const trop = '100000000.01';
		const ligne = { date: '20261001', libelle: 'FICTIF', id: 'A1' };
		const lignes = ofxCp1252(ofxTexte([{ ...ligne, montant: trop }], null));
		const solde = ofxCp1252(
			ofxTexte([{ ...ligne, montant: '1.00' }], { montant: trop, date: '20261020' })
		);
		expect(code(sourceOfx.lire({ octets: lignes } as never))).toBe('fichier_illisible');
		expect(code(sourceOfx.lire({ octets: solde } as never))).toBe('fichier_illisible');
	});

	it('par l’application, rien n’est écrit', () => {
		const r = i.app.pointage.importer(i.ctx(), {
			compteId: i.compteId,
			nomFichier: 'fictif.csv',
			octets: utf8(`${entete}01/10/2026;A;12345678901234;1,00\n`),
			reglage
		} as never);
		expect(r.ok).toBe(false);
		expect(j().lignesReleve).toEqual([]);
	});

	it('une base déjà touchée se signale, et la ligne se retire', () => {
		const octets = ofxCp1252(
			ofxTexte([{ date: '20261001', montant: '-1.00', id: 'A1', libelle: 'FICTIF' }], null)
		);
		valeur(i.app.pointage.importer(i.ctx(), { compteId: i.compteId, nomFichier: 'f.ofx', octets }));
		const ligne = j().lignesReleve[0]!;
		i.base
			.prepare('UPDATE ligne_releve SET montant_centimes = ? WHERE id = ?')
			.run(MONTANT_MAX + 1, ligne.id);
		expect(verifier()).toEqual([
			`Ligne de relevé ${ligne.id} : montant démesuré, à retirer de son import.`
		]);
		expect(i.app.pointage.retirerLigne(i.ctx(), ligne.id).ok).toBe(true);
		expect(j().lignesReleve).toEqual([]);
	});
});

describe('fond de tâche et logs', () => {
	let dossier: string;
	beforeEach(() => {
		dossier = mkdtempSync(join(tmpdir(), 'ape-battement-'));
		return () => rmSync(dossier, { recursive: true, force: true });
	});

	it('un battement impossible se note et n’arrête rien', () => {
		const fichier = join(dossier, 'pas-un-dossier');
		writeFileSync(fichier, '');
		const erreurs: string[] = [];
		const journaliseur = {
			info: () => {},
			erreur: (m: string) => void erreurs.push(m)
		};
		expect(() =>
			demarrerMinuteur({
				dossier: fichier,
				sauvegarde: false,
				versions: false,
				exploitation: {} as never,
				horloge: { maintenant: () => '2026-10-10T10:00:00.000Z' } as never,
				journaliseur
			})
		).not.toThrow();
		expect(erreurs).toEqual(['battement_impossible']);
	});

	it('le nom de l’évènement survit à un champ message', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		creerJournaliseur(() => 'x').erreur('sauvegarde_echouee', { message: 'Fatal' });
		expect(JSON.parse(log.mock.calls[0]![0] as string).message).toBe('sauvegarde_echouee');
		log.mockRestore();
	});

	it('une erreur de montant ne porte pas le montant', () => {
		expect(() => c(0.5)).toThrow(/^Montant non entier ou hors limites\.$/);
	});
});

describe('Exercice clôturé (P7, P10, P12, P14)', () => {
	const fictive = () => instanceFictive('2027-10-15T10:00:00.000Z');
	const clore = (x: InstanceFictive) => {
		valeur(x.app.exercices.ouvrirSuivant(x.ctx()));
		valeur(x.app.exercices.cloturer(x.ctx(), x.exercice('2026-2027').id));
	};
	const creerLivret = (x: InstanceFictive, ancre = x.exercice('2026-2027').id) =>
		valeur(
			x.app.parametrage.creerCompte(x.ctx(), {
				libelle: 'Second livret',
				type: 'epargne',
				reserve: false,
				ancre: { exerciceId: ancre, solde: c(0) }
			})
		);
	const empreinteIntacte = (x: InstanceFictive) =>
		expect(valeur(x.app.etats.verifier(x.ctx())).map((v) => v.message)).toEqual([]);

	it('P7 : le Document d’AG garde l’Écart d’un Compte désactivé', () => {
		const x = fictive();
		const livret = creerLivret(x);
		valeur(
			x.app.pointage.saisirSolde(x.ctx(), {
				compteId: livret,
				date: '2026-10-31',
				solde: c(12_50)
			})
		);
		valeur(x.app.parametrage.activerCompte(x.ctx(), livret, false));
		const e = () => x.exercice('2026-2027');
		expect(valeur(x.app.etats.tableau(x.ctx(), e())).bilan.type).toBe('ecart');
		clore(x);
		expect(valeur(x.app.etats.tableau(x.ctx(), e())).cartes.map((k) => k.compte.id)).toContain(
			livret
		);
		const texte = JSON.stringify(valeur(x.app.etats.modele(x.ctx(), 'document-ag', e())));
		expect(texte).toContain('Second livret');
		expect(texte).not.toContain('Aucun Écart');
		empreinteIntacte(x);
	});

	const somme = (x: InstanceFictive) =>
		valeur(
			x.app.creances.ajouter(x.ctx(), {
				sens: 'creance',
				tiers: 'Famille fictive',
				motif: 'Cotisation',
				montant: c(200_00),
				date: '2026-10-01',
				actionId: null,
				note: null
			})
		).id;

	it('P10 : une annulation vue par la clôture ne se rétablit plus', () => {
		const x = instanceFictive('2026-11-04T10:00:00.000Z');
		const id = somme(x);
		x.horloge.instant = '2026-11-05T10:00:00.000Z';
		valeur(x.app.creances.annuler(x.ctx(), id));
		x.horloge.instant = '2027-10-15T10:00:00.000Z';
		clore(x);
		const e = x.exercice('2026-2027');
		const r = x.app.creances.retablir(x.ctx(), id);
		expect(code(r)).toBe('exercice_cloture');
		expect(valeur(x.app.etats.tresorerie(x.ctx(), e)).etat.creances).toBe(0);
		empreinteIntacte(x);
	});

	it('P10 : annulée après la clôture ou après la fin, elle se rétablit encore', () => {
		const x = instanceFictive('2027-09-15T10:00:00.000Z');
		const id = somme(x);
		valeur(x.app.creances.annuler(x.ctx(), id));
		x.horloge.instant = '2027-10-15T10:00:00.000Z';
		clore(x);
		expect(x.app.creances.retablir(x.ctx(), id).ok).toBe(true);
		empreinteIntacte(x);
	});

	it('P14 : une ancre posée après la clôture ne retire pas la rangée de l’état clos', () => {
		const x = fictive();
		const id = x.app.socle.depots.parametrage.creerCompte({
			libelle: 'Compte sans ancre',
			type: 'banque',
			ordre: 50
		});
		clore(x);
		const e = () => x.exercice('2026-2027');
		const lire = () =>
			valeur(x.app.etats.tresorerie(x.ctx(), e())).etat.comptes.map((k) => k.compteId);
		expect(lire()).toContain(id);
		x.base
			.prepare(
				'INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, 0)'
			)
			.run(id, x.exercice('2027-2028').id);
		expect(lire()).toContain(id);
		empreinteIntacte(x);
	});
});

describe('chèques (P12, P13)', () => {
	it('P12 : le compteur lit la fin de l’Exercice, comme l’État de trésorerie', () => {
		const x = instancePrete();
		x.horloge.instant = '2027-08-20T10:00:00.000Z';
		const recu = valeur(
			x.app.cheques.enregistrerRecu(x.ctx(), {
				date: '2027-08-20',
				emetteur: 'Famille fictive',
				banque: 'Banque fictive',
				numero: null,
				montant: c(100_00),
				lignes: [
					{
						montant: c(100_00),
						contraire: false,
						reduction: false,
						natureId: x.natureId,
						actionId: null,
						exerciceRattachementId: null,
						note: null
					}
				]
			})
		);
		x.horloge.instant = '2027-09-02T10:00:00.000Z';
		valeur(x.app.exercices.ouvrirSuivant(x.ctx()));
		valeur(
			x.app.cheques.creerRemise(x.ctx(), {
				chequeIds: [recu.id],
				compteId: x.compteId,
				date: '2027-09-02',
				total: c(100_00)
			})
		);
		const e = x.courant;
		expect(valeur(x.app.etats.tresorerie(x.ctx(), e)).etat.chequesARemettre).toBe(100_00);
		expect(chequesARemettre(x.app.socle.depots.operations.journal(), e)).toBe(1);
	});

	it('P13 : une formule annulée qui passe en banque se signale', () => {
		valeur(i.app.cheques.annulerFormule(i.ctx(), { numero: '1234567', beneficiaire: null }));
		const l = { libelle: 'CHEQUE N 1234567', montant: c(-80_00) };
		expect(chequeAbsent(j(), l)).toBe('1234567');
	});
});

describe('export complet', () => {
	const lire = async (x: Instance) => {
		const { flux } = valeur(x.app.etats.exportComplet(x.ctx()));
		return unzipSync(new Uint8Array(await new Response(flux).arrayBuffer()));
	};

	it('dit quelle Pièce manque, sans figer le flux', async () => {
		const id = valeur(
			i.app.operations.creer(i.ctx(), i.saisie('depense', 10_00, { date: '2026-10-05' }))
		).id;
		valeur(
			i.app.pieces.deposer(i.ctx(), {
				nomOriginal: 'facture-fictive.pdf',
				octets: new TextEncoder().encode('%PDF-1.4 fictif'),
				operationId: id
			})
		);
		const avant = await lire(i);
		expect(Object.keys(avant)).not.toContain('PIECES-MANQUANTES.txt');
		i.fichiers.clear();
		const archive = await lire(i);
		const note = strFromU8(archive['PIECES-MANQUANTES.txt']!);
		expect(note).toContain('facture-fictive');
		expect(Object.keys(archive).filter((n) => n.startsWith('pieces/'))).toEqual([]);
		expect(strFromU8(archive['LISEZMOI.txt']!)).toContain('PIECES-MANQUANTES.txt');
	});
});
