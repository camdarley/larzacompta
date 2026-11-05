/**
 * Non-régression des défauts de domaine et de sécurité trouvés par la revue indépendante.
 * Chaque cas rejoue le scénario relevé, de bout en bout dans l'application.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { ReglageCsv } from '#lib/domaine/releve/csv.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { unzipSync, strFromU8 } from 'fflate';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaCreationAcces } from '#lib/schemas/acces.ts';
import { suiteSure } from '#lib/server/http.ts';
import { genererCsv } from '#lib/server/infra/documents/csv.ts';
import { genererZip } from '#lib/server/infra/documents/archive.ts';
import { restaurer } from '#lib/server/infra/sauvegarde/restauration.ts';
import { banc, type Banc } from './aides/app.ts';
import { depenseSimple, instanceFictive, type InstanceFictive } from './aides/fictive.ts';

const c = centimes;
const utf8 = (t: string) => new TextEncoder().encode(t);

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}
const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? 'ok' : r.erreur?.code);

const journalDe = (i: InstanceFictive | Banc) => i.app.socle.depots.operations.journal();

function creerDepense(i: InstanceFictive, date: string, montant: number, compteId = i.banque) {
	return valeur(
		i.app.operations.creer(
			i.ctx(),
			depenseSimple(i, {
				date,
				compteId,
				montant: c(montant),
				lignes: [
					{
						montant: c(montant),
						contraire: false,
						reduction: false,
						natureId: i.nature('Transport'),
						actionId: null,
						exerciceRattachementId: null,
						note: null
					}
				]
			} as never)
		)
	).id;
}

function importerOfx(
	i: InstanceFictive,
	lignes: Parameters<typeof ofxTexte>[0],
	solde: Parameters<typeof ofxTexte>[1] = null,
	compteId = i.banque
) {
	return valeur(
		i.app.pointage.importer(i.ctx(), {
			compteId,
			nomFichier: 'fictif.ofx',
			octets: ofxCp1252(ofxTexte(lignes, solde))
		})
	);
}

describe('relevé : aucune ligne ne disparaît (FR-12)', () => {
	let i: InstanceFictive;
	beforeEach(() => {
		i = instanceFictive();
	});

	it('un prélèvement mensuel à la même référence CSV garde ses deux lignes', () => {
		const reglage: ReglageCsv = {
			date: 'Date',
			libelle: 'Libellé',
			identifiant: 'Référence',
			montant: { mode: 'unique', colonne: 'Montant' }
		};
		const csv = (date: string) =>
			utf8(`Date;Libellé;Référence;Montant\n${date};ASSUR;RUM-001;-42,00\n`);
		const importer = (date: string) =>
			valeur(
				i.app.pointage.importer(i.ctx(), {
					compteId: i.banque,
					nomFichier: 'fictif.csv',
					octets: csv(date),
					reglage
				})
			);
		expect(importer('05/10/2026')).toMatchObject({ nouvelles: 1, connues: 0 });
		expect(importer('05/11/2026')).toMatchObject({
			nouvelles: 1,
			connues: 0,
			aConfirmer: 1,
			identifiantsRepetes: 1
		});
		const lignes = journalDe(i).lignesReleve;
		expect(lignes).toHaveLength(2);
		expect(lignes.find((l) => l.date === '2026-11-05')).toMatchObject({
			doublon: 'a_confirmer',
			identifiantSource: null
		});
	});

	it('un FITID répété dans un seul OFX garde les deux montants', () => {
		const lignes = [
			{ date: '20261010', montant: '-10.00', id: 'X', libelle: 'A' },
			{ date: '20261011', montant: '-25.00', id: 'X', libelle: 'B' }
		];
		expect(importerOfx(i, lignes)).toMatchObject({ nouvelles: 2, connues: 0, aConfirmer: 1 });
		expect(
			journalDe(i)
				.lignesReleve.map((l) => l.montant)
				.sort()
		).toEqual([-1000, -2500]);
		// Réimporter le même fichier ne rajoute rien.
		expect(importerOfx(i, lignes)).toMatchObject({ nouvelles: 0, connues: 2 });
	});

	it('refuse un fichier d’un autre compte bancaire, sauf confirmation', () => {
		const ligne = { date: '20261010', montant: '-10.00', id: 'A', libelle: 'A' };
		importerOfx(i, [ligne]);
		const autre = ofxTexte([{ ...ligne, id: 'B' }], null).replace(
			'<ACCTID>00000000000',
			'<ACCTID>99999999999'
		);
		const e = { compteId: i.banque, nomFichier: 'autre.ofx', octets: ofxCp1252(autre) };
		expect(code(i.app.pointage.importer(i.ctx(), e))).toBe('releve_autre_compte');
		expect(journalDe(i).lignesReleve).toHaveLength(1);
		expect(i.app.pointage.importer(i.ctx(), { ...e, autreCompte: true })).toMatchObject({
			ok: true
		});
		expect(journalDe(i).lignesReleve).toHaveLength(2);
	});

	it('un solde d’avant l’ancre est ignoré : la barre ne se fausse pas', () => {
		const r = importerOfx(i, [{ date: '20260815', montant: '-10.00', id: 'A', libelle: 'A' }], {
			montant: '777.00',
			date: '20260815'
		});
		expect(r).toMatchObject({ ecartees: 1, soldeIgnore: true });
		expect(journalDe(i).constats).toEqual([]);
		const direct = i.app.pointage.saisirSolde(i.ctx(), {
			compteId: i.banque,
			date: '2026-08-15',
			solde: c(777_00)
		});
		expect(code(direct)).toBe('ligne_avant_ancre');
	});
});

describe('Pointage', () => {
	let i: InstanceFictive;
	beforeEach(() => {
		i = instanceFictive();
	});

	it('une ligne postérieure à tout Exercice n’antidate rien', () => {
		const op = creerDepense(i, '2026-10-05', 100_00);
		importerOfx(i, [{ date: '20270902', montant: '-100.01', id: 'A', libelle: 'A' }]);
		const ligne = journalDe(i).lignesReleve[0]!;
		const cote = journalDe(i).operations.find((o) => o.id === op)!.cotes[0]!;
		const d = { compteId: i.banque, coteIds: [cote.id], ligneIds: [ligne.id] };
		expect(code(i.app.pointage.ajuster(i.ctx(), d))).toBe('date_hors_exercice');
		expect(code(i.app.pointage.ligneASaisir(i.ctx(), ligne.id))).toBe('date_hors_exercice');
		expect(journalDe(i).operations).toHaveLength(1);
	});

	it('annuler un Pointage annule son ajustement : réajuster ne double pas', () => {
		const op = creerDepense(i, '2026-10-05', 100_00);
		importerOfx(i, [{ date: '20261006', montant: '-100.01', id: 'A', libelle: 'A' }]);
		const ligne = journalDe(i).lignesReleve[0]!;
		const cote = journalDe(i).operations.find((o) => o.id === op)!.cotes[0]!;
		const avant = soldeCompte(journalDe(i), i.banque, '2026-12-31');
		const d = { compteId: i.banque, coteIds: [cote.id], ligneIds: [ligne.id] };

		const premier = valeur(i.app.pointage.ajuster(i.ctx(), d));
		expect(valeur(i.app.pointage.annuler(i.ctx(), premier.id))).toEqual({ ajustementsAnnules: 1 });
		expect(soldeCompte(journalDe(i), i.banque, '2026-12-31')).toBe(avant);

		valeur(i.app.pointage.ajuster(i.ctx(), d));
		expect(soldeCompte(journalDe(i), i.banque, '2026-12-31')).toBe(avant - 1);
		expect(journalDe(i).operations.filter((o) => o.origine === 'ajustement')).toHaveLength(1);
	});
});

describe('ancre', () => {
	it('refuse une ancre posée après un mouvement du Compte', () => {
		const i = instanceFictive('2027-10-15T10:00:00.000Z');
		const depot = i.app.socle.depots.parametrage;
		const compte = depot.creerCompte({ libelle: 'Sans ancre', type: 'epargne', ordre: 9 });
		creerDepense(i, '2026-10-05', 70_00, compte);
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		const r = i.app.exercices.enregistrerBalance(i.ctx(), {
			exerciceId: i.exercice('2027-2028').id,
			soldes: [{ compteId: compte, solde: c(70_00) }]
		});
		expect(code(r)).toBe('ancre_apres_mouvement');
		expect(() => depot.ecrireAncre(compte, i.exercice('2027-2028').id, c(1))).toThrow(
			'ancre_invalide'
		);
	});
});

describe('Compte désactivé', () => {
	it('refuse de désactiver un Compte qui porte un solde', () => {
		const i = instanceFictive();
		expect(code(i.app.parametrage.activerCompte(i.ctx(), i.livret, false))).toBe('compte_non_vide');
		expect(journalDe(i).comptes.find((x) => x.id === i.livret)?.actif).toBe(true);
	});
});

describe('Caisse sans Session', () => {
	it('un ticket daté du jour du comptage résorbe l’Écart', () => {
		const i = instanceFictive();
		const caisse = i.app.socle.depots.parametrage.creerCompte({
			libelle: 'Caisse fictive',
			type: 'caisse',
			ordre: 9
		});
		i.app.socle.depots.parametrage.ecrireAncre(caisse, i.exercice('2026-2027').id, c(100_00));
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: caisse,
				date: '2026-11-04',
				solde: c(90_00)
			})
		);
		const carte = () =>
			valeur(i.app.etats.tableau(i.ctx(), i.exercice('2026-2027'))).cartes.find(
				(x) => x.compte.id === caisse
			)!;
		expect(carte()).toMatchObject({ ecart: -1000, constate: 9000 });
		i.horloge.instant = '2026-11-04T16:00:00.000Z';
		creerDepense(i, '2026-11-04', 10_00, caisse);
		expect(carte()).toMatchObject({ ecart: 0, constate: 9000, calcule: 9000 });
	});
});

describe('sessions et mots de passe', () => {
	const mdp = 'un mot de passe solide';
	const entree = { identifiant: 'dominique', motDePasse: mdp, adresse: '10.0.0.1' };

	async function creerDominique(b: Banc) {
		const { jeton } = valeur(
			b.app.acces.creer(b.ctx(), {
				identifiant: 'dominique',
				nomAffiche: 'Dominique',
				role: 'lecteur'
			})
		);
		valeur(await b.app.acces.accepterInvitation(b.app.ctx(null), { jeton, motDePasse: mdp }));
	}

	it('changer son mot de passe ferme les autres sessions et rouvre la sienne', async () => {
		const b = banc();
		await creerDominique(b);
		const a = valeur(await b.app.acces.connecter(b.app.ctx(null), entree));
		const autre = valeur(await b.app.acces.connecter(b.app.ctx(null), entree));
		const r = valeur(
			await b.app.acces.changerMotDePasse(b.app.ctx(a.acces), {
				actuel: mdp,
				nouveau: 'un autre mot de passe solide'
			})
		);
		const lire = (jeton: string) => b.app.acces.accesDepuisSession(b.app.ctx(null), jeton);
		expect(lire(a.jeton)).toBeNull();
		expect(lire(autre.jeton)).toBeNull();
		expect(lire(r.jeton)?.identifiant).toBe('dominique');
	});

	it('une session volée ne survit pas à la réinitialisation', async () => {
		const b = banc();
		await creerDominique(b);
		const volee = valeur(await b.app.acces.connecter(b.app.ctx(null), entree));
		const lien = valeur(b.app.acces.reinitialiser(b.app.ctx(null), 'dominique'));
		const r = valeur(
			await b.app.acces.accepterInvitation(b.app.ctx(null), {
				jeton: lien,
				motDePasse: 'un autre mot de passe solide'
			})
		);
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), volee.jeton)).toBeNull();
		expect(b.app.acces.accesDepuisSession(b.app.ctx(null), r.jeton)).not.toBeNull();
	});

	it('une clé bloquée et un faux jeton ne déclenchent aucun hachage', async () => {
		const b = banc();
		const hacheur = b.app.socle.hacheur;
		let appels = 0;
		const verifier = hacheur.verifier;
		const hacher = hacheur.hacher;
		hacheur.verifier = (m, p) => ((appels += 1), verifier(m, p));
		hacheur.hacher = (m) => ((appels += 1), hacher(m));
		const bloquee = { identifiant: 'x', motDePasse: 'faux', adresse: '10.9.9.9' };
		for (let n = 0; n < 10; n++) await b.app.acces.connecter(b.app.ctx(null), bloquee);
		appels = 0;
		const r = await b.app.acces.connecter(b.app.ctx(null), bloquee);
		expect(code(r)).toBe('trop_de_tentatives');
		const i = await b.app.acces.accepterInvitation(b.app.ctx(null), {
			jeton: 'faux',
			motDePasse: mdp
		});
		expect(code(i)).toBe('lien_invalide');
		expect(appels).toBe(0);
	});

	it('la lecture de session remonte la nouvelle expiration, pour reposer le cookie', async () => {
		const b = banc();
		await creerDominique(b);
		const s = valeur(await b.app.acces.connecter(b.app.ctx(null), entree));
		expect(b.app.acces.lireSession(b.app.ctx(null), s.jeton)?.prolongeeJusquAu).toBeNull();
		b.horloge.instant = '2026-11-06T10:00:00.000Z';
		const lue = b.app.acces.lireSession(b.app.ctx(null), s.jeton);
		expect(lue?.prolongeeJusquAu?.slice(0, 10)).toBe('2026-11-13');
	});

	it('l’identifiant réservé au lien initial est refusé, sans tenir compte de la casse', () => {
		const b = banc();
		const e = { identifiant: '__INITIAL__', nomAffiche: 'Porte', role: 'tresorier' as const };
		expect(code(b.app.acces.creer(b.ctx(), e))).toBe('identifiant_reserve');
		expect(schemaCreationAcces.safeParse(e).success).toBe(false);
	});

	it('suiteSure ne laisse passer ni contrôle ni autre origine', () => {
		expect(suiteSure('/operations?q=1')).toBe('/operations?q=1');
		for (const piege of ['/\t/evil.example', '/\n/evil.example', '/\r\n/evil.example', '//evil']) {
			expect(suiteSure(piege)).toBe('/');
		}
	});
});

describe('garde CSV', () => {
	it('préfixe une formule qui commence par moins et un chiffre, pas un montant', () => {
		const csv = genererCsv(['a'], [["-1+cmd|' /C calc'!A0"], ['-12,50'], ['-1 234,50'], ['-3']]);
		expect(csv).toContain("'-1+cmd");
		expect(csv).toContain('\r\n-12,50\r\n-1 234,50\r\n-3\r\n');
	});
});

describe('journal', () => {
	it('borne une page démesurée', () => {
		const b = banc();
		for (const page of [Number.POSITIVE_INFINITY, 1e20, Number.NaN]) {
			expect(b.app.journal.lister(b.ctx(), {}, page).ok).toBe(true);
		}
	});
});

describe('export complet en flux', () => {
	it('lit une Pièce à la fois, et seulement quand le flux avance', async () => {
		const lues: string[] = [];
		const entree = (nom: string) => ({
			nom,
			lire: () => {
				lues.push(nom);
				return new Uint8Array(1024).fill(7);
			}
		});
		const flux = genererZip([
			{ nom: 'LISEZMOI.txt', lire: () => 'bonjour' },
			entree('pieces/a.pdf'),
			entree('pieces/b.pdf')
		]);
		const lecteur = flux.getReader();
		await lecteur.read();
		expect(lues.length).toBeLessThan(2);
		const morceaux: Uint8Array[] = [];
		for (;;) {
			const { done, value } = await lecteur.read();
			if (done) break;
			morceaux.push(value);
		}
		const tout = new Uint8Array(await new Blob(morceaux as BlobPart[]).arrayBuffer());
		expect(lues).toHaveLength(2);
		expect(tout.length).toBeGreaterThan(2048);
	});

	it('produit une archive lisible, accents compris', async () => {
		const flux = genererZip([
			{ nom: 'LISEZMOI.txt', lire: () => 'été' },
			{ nom: 'pieces/é.pdf', lire: () => new Uint8Array([1, 2, 3]) }
		]);
		const archive = unzipSync(new Uint8Array(await new Response(flux).arrayBuffer()));
		expect(strFromU8(archive['LISEZMOI.txt']!)).toBe('été');
		expect([...archive['pieces/é.pdf']!]).toEqual([1, 2, 3]);
	});
});

describe('restauration après un arrêt brutal', () => {
	it('garde le WAL avec la base dans avant-restauration', async () => {
		const dossier = mkdtempSync(join(tmpdir(), 'ape-restauration-'));
		try {
			writeFileSync(join(dossier, 'base.sqlite'), 'base');
			writeFileSync(join(dossier, 'base.sqlite-wal'), 'ecritures recentes');
			writeFileSync(join(dossier, 'base.sqlite-shm'), 'index');
			const restic = {
				async lancer(args: string[]) {
					const cible = args[args.indexOf('--target') + 1] as string;
					mkdirSync(join(cible, 'sauvegardes', 'copie'), { recursive: true });
					writeFileSync(join(cible, 'sauvegardes', 'copie', 'base.sqlite'), 'sauvegarde');
				}
			};
			const r = await restaurer(dossier, restic as never, {
				instantane: 'latest',
				remplacer: true,
				maintenant: '2026-11-05T10:00:00.000Z'
			});
			expect(r.ok).toBe(true);
			const gardee = join(dossier, 'avant-restauration', '2026-11-05T10-00-00.000Z');
			expect(readFileSync(join(gardee, 'base.sqlite-wal'), 'utf8')).toBe('ecritures recentes');
			expect(existsSync(join(gardee, 'base.sqlite-shm'))).toBe(true);
			expect(existsSync(join(dossier, 'base.sqlite-wal'))).toBe(false);
		} finally {
			rmSync(dossier, { recursive: true, force: true });
		}
	});
});

describe('fiche de l’association', () => {
	it('ne se lit qu’avec le droit de paramétrer (AD-15)', () => {
		const i = instanceFictive();
		const lecteur = { ...i.tresorier, role: 'lecteur' as const };
		expect(code(i.app.parametrage.fiche(i.app.ctx(lecteur)))).toBe('acces_refuse');
		expect(valeur(i.app.parametrage.fiche(i.ctx()))?.nom).toBe('APE des Tilleuls');
	});
});

describe('Exercice clôturé : les états ne changent plus (FR-3)', () => {
	function clos(instant = '2027-10-15T10:00:00.000Z') {
		const i = instanceFictive(instant);
		const e = () => i.exercice('2026-2027');
		return { i, e };
	}
	const etat = (i: InstanceFictive, e: ReturnType<InstanceFictive['exercice']>) =>
		valeur(i.app.etats.tresorerie(i.ctx(), e)).etat;
	const dette = (date: string) => ({
		sens: 'dette' as const,
		tiers: 'Bénévole fictif',
		motif: 'Avance',
		montant: c(300_00),
		date,
		actionId: null,
		note: null
	});

	it('une Dette datée avant le premier Exercice est refusée après la clôture', () => {
		const { i, e } = clos();
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), e().id));
		expect(code(i.app.creances.ajouter(i.ctx(), dette('2026-06-15')))).toBe('exercice_cloture');
		expect(etat(i, e()).dettes).toBe(0);
		expect(i.app.creances.ajouter(i.ctx(), dette('2027-09-15')).ok).toBe(true);
	});

	it('le trigger le redit, même si le domaine est contourné', () => {
		const { i, e } = clos();
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), e().id));
		expect(() =>
			i.app.socle.depots.creances.creer({
				...dette('2026-06-15'),
				creeLe: '2027-10-15T10:00:00.000Z',
				creePar: i.tresorier.id
			})
		).toThrow('exercice_cloture');
	});

	it('annuler une Créance après une clôture anticipée ne change pas l’état clos', () => {
		const { i, e } = clos('2026-11-04T10:00:00.000Z');
		const { id } = valeur(
			i.app.creances.ajouter(i.ctx(), {
				...dette('2026-10-01'),
				sens: 'creance',
				montant: c(200_00)
			})
		);
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), e().id));
		expect(etat(i, e()).creances).toBe(20000);
		i.horloge.instant = '2026-11-05T10:00:00.000Z';
		valeur(i.app.creances.annuler(i.ctx(), id));
		expect(etat(i, e()).creances).toBe(20000);
		expect(valeur(i.app.etats.verifier(i.ctx()))).toEqual([]);
	});

	function ecartSurLivret(i: InstanceFictive) {
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: i.livret,
				date: '2026-10-31',
				solde: c(1_00)
			})
		);
	}

	it('le Document d’AG garde l’Écart après renommage ou désactivation du Compte', () => {
		const { i, e } = clos();
		ecartSurLivret(i);
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), e().id));
		const section = () => {
			const m = valeur(i.app.etats.modele(i.ctx(), 'document-ag', e()));
			return JSON.stringify(m).match(/Écarts restants.*/)?.[0] ?? '';
		};
		const avant = section();
		expect(avant).toContain('Livret');
		i.app.socle.depots.parametrage.modifierCompte(i.livret, {
			libelle: 'Nouveau nom',
			type: 'epargne'
		});
		i.app.socle.depots.parametrage.activerCompte(i.livret, false);
		expect(section()).toBe(avant);
	});

	it('un Compte désactivé avec un Écart reste au Tableau de contrôle', () => {
		const { i, e } = clos();
		ecartSurLivret(i);
		i.app.socle.depots.parametrage.activerCompte(i.livret, false);
		const t = valeur(i.app.etats.tableau(i.ctx(), e()));
		expect(t.cartes.some((x) => x.compte.id === i.livret)).toBe(true);
		expect(t.bilan.type).toBe('ecart');
	});

	it('une Opération non pointée compensée par le constat se dit, et entre au récapitulatif', () => {
		const { i, e } = clos();
		creerDepense(i, '2026-10-05', 100_00);
		const j = journalDe(i);
		const banque = j.ancres.find((a) => a.compteId === i.banque)!.solde;
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: i.banque,
				date: '2026-10-31',
				solde: c(banque - 100_00)
			})
		);
		const r = valeur(i.app.exercices.recapitulatifCloture(i.ctx(), e().id));
		expect(r.ecarts).toHaveLength(1);
		expect(r.ecarts[0]?.phraseEcart).toMatch(/Le solde tombe juste/);
	});

	it('lignes.csv lit le paramétrage figé de l’Exercice clos', async () => {
		const { i, e } = clos();
		creerDepense(i, '2026-10-05', 100_00);
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		valeur(i.app.exercices.cloturer(i.ctx(), e().id));
		const nature = i.nature('Transport');
		i.app.socle.depots.parametrage.modifierNature(nature, {
			libelle: 'Transport',
			groupeId: i.app.socle.depots.parametrage.groupes()[0]!.id,
			neutre: true
		});
		const { flux } = valeur(i.app.etats.exportComplet(i.ctx()));
		const archive = unzipSync(new Uint8Array(await new Response(flux).arrayBuffer()));
		const [, ligne] = strFromU8(archive['lignes.csv']!).trim().split('\r\n');
		expect(ligne?.endsWith('2026-2027')).toBe(true);
	});
});

describe('Opérations', () => {
	it('un Mouvement interne en transit se retrouve sur l’Exercice de son arrivée', () => {
		const i = instanceFictive('2027-08-01T10:00:00.000Z');
		valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
		const id = valeur(
			i.app.operations.creer(i.ctx(), {
				forme: 'interne',
				libelle: 'Virement fictif',
				reference: null,
				note: null,
				deId: i.banque,
				versId: i.livret,
				parti: '2027-08-31',
				arrive: '2027-09-02',
				montant: c(500_00)
			} as never)
		).id;
		const e = i.exercice('2027-2028');
		const r = valeur(
			i.app.operations.rechercher(
				i.ctx(),
				{ du: e.debut!, au: e.fin!, compteId: i.livret, internes: true },
				1
			)
		);
		expect(r.rangees.map((l) => l.id)).toEqual([id]);
	});

	it('un virement pointé d’un seul côté ne se dit pas Pointé', () => {
		const i = instanceFictive();
		const id = valeur(
			i.app.operations.creer(i.ctx(), {
				forme: 'interne',
				libelle: 'Virement fictif',
				reference: null,
				note: null,
				deId: i.banque,
				versId: i.livret,
				parti: '2026-10-05',
				arrive: '2026-10-05',
				montant: c(500_00)
			} as never)
		).id;
		importerOfx(i, [{ date: '20261005', montant: '-500.00', id: 'A', libelle: 'VIR' }]);
		const j = journalDe(i);
		const cote = j.operations.find((o) => o.id === id)!.cotes.find((x) => x.compteId === i.banque)!;
		valeur(
			i.app.pointage.pointer(i.ctx(), {
				compteId: i.banque,
				coteIds: [cote.id],
				ligneIds: [j.lignesReleve[0]!.id]
			})
		);
		const etat = (compteId?: number) =>
			valeur(i.app.operations.rechercher(i.ctx(), { compteId }, 1)).rangees.find((l) => l.id === id)
				?.etat;
		expect(etat(i.livret)).toBe('a_pointer');
		expect(etat(i.banque)).toBe('pointe');
		expect(etat()).toBe('partiel');
	});

	it('refuse de rendre plus que la somme reçue', () => {
		const i = instanceFictive();
		const neutre = i.sommeARendre;
		const ligne = (montant: number) => ({
			montant: c(montant),
			contraire: false,
			reduction: false,
			natureId: neutre,
			actionId: null,
			exerciceRattachementId: null,
			note: null
		});
		const recue = valeur(
			i.app.operations.creer(
				i.ctx(),
				depenseSimple(i, {
					intention: 'recette',
					montant: c(100_00),
					lignes: [ligne(100_00)]
				} as never)
			)
		).id;
		const rendre = (montant: number) =>
			i.app.operations.creer(i.ctx(), {
				...depenseSimple(i, { montant: c(montant), lignes: [ligne(montant)] } as never),
				rendDe: recue
			});
		expect(code(rendre(150_00))).toBe('rendu_excessif');
		expect(rendre(100_00).ok).toBe(true);
	});
});
