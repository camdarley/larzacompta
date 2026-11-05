import { describe, expect, it } from 'vitest';
import { centimes } from '#lib/domaine/montant.ts';
import { unzipSync, strFromU8 } from 'fflate';
import { ATTENDUS } from '../jeux/exercice-fictif.ts';
import {
	creerOperation,
	depenseSimple,
	instanceFictive,
	jouerExerciceFictif,
	type InstanceFictive
} from './aides/fictive.ts';

const c = centimes;

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? 'ok' : r.erreur?.code);

/** 2026-2027 complet, 2027-2028 ouvert derrière lui. On se place fin 2027. */
function anneeTerminee() {
	const i = instanceFictive('2027-10-15T10:00:00.000Z');
	jouerExerciceFictif(i);
	valeur(i.app.exercices.ouvrirSuivant(i.ctx()));
	return {
		i,
		e: i.exercice('2026-2027'),
		suivant: i.exercice('2027-2028')
	};
}

const cloturer = (i: InstanceFictive, id: number) => i.app.exercices.cloturer(i.ctx(), id);

describe('clôture', () => {
	it('E3 : refuse un Exercice plus récent que le plus ancien ouvert', () => {
		const { i, suivant } = anneeTerminee();
		expect(code(cloturer(i, suivant.id))).toBe('cloture_ordre');
		const r = valeur(i.app.exercices.recapitulatifCloture(i.ctx(), suivant.id));
		expect(r.refus?.code).toBe('cloture_ordre');
	});

	it('écrit statut, paramétrage figé et empreinte, et le note au Journal', () => {
		const { i, e } = anneeTerminee();
		valeur(cloturer(i, e.id));
		const lu = i.exercice('2026-2027');
		expect(lu.statut).toBe('cloture');
		const c1 = i.app.socle.depots.exercices.cloture(e.id)!;
		expect(c1.empreinte).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.parse(c1.parametrageFigeJson).groupes.length).toBeGreaterThan(0);
		expect(i.journal().at(-1)?.evenement).toBe('exercice.cloture');
	});

	it('E5 : pas de seconde clôture ni de réouverture', () => {
		const { i, e } = anneeTerminee();
		valeur(cloturer(i, e.id));
		expect(code(cloturer(i, e.id))).toBe('exercice_cloture');
		expect(() => i.base.exec(`UPDATE exercice SET statut = 'ouvert' WHERE id = ${e.id}`)).toThrow(
			'exercice_cloture'
		);
	});

	it('refuse à qui ne saisit pas', () => {
		const { i, e } = anneeTerminee();
		expect(code(i.app.exercices.cloturer(i.app.ctx(null), e.id))).toBe('acces_refuse');
	});

	it('FR-3 : Écarts, lignes et Pièces se listent sans bloquer', () => {
		const { i, e } = anneeTerminee();
		valeur(
			i.app.pointage.saisirSolde(i.ctx(), {
				compteId: i.banque,
				date: '2027-08-31',
				solde: c(-300_00)
			})
		);
		valeur(
			i.app.pointage.saisirLigne(i.ctx(), {
				compteId: i.banque,
				date: '2027-08-20',
				montant: c(-1_00),
				libelle: 'Ligne à pointer'
			})
		);
		const r = valeur(i.app.exercices.recapitulatifCloture(i.ctx(), e.id));
		expect(r.refus).toBeNull();
		expect(r.lignes).toBe(1);
		expect(r.pieces).toBeGreaterThan(0);
		expect(r.ecarts.map((x) => x.compte.libelle)).toEqual(['Banque des Tilleuls']);
		expect(r.suivant?.libelle).toBe('2027-2028');
		valeur(cloturer(i, e.id));
		expect(valeur(i.app.exercices.recapitulatifCloture(i.ctx(), e.id)).cloture).not.toBeNull();
		expect(code(i.app.exercices.recapitulatifCloture(i.ctx(), 9999))).toBe('element_introuvable');
	});
});

describe('après la clôture', () => {
	function close() {
		const a = anneeTerminee();
		valeur(cloturer(a.i, a.e.id));
		return a;
	}

	it('refuse une Opération, un Côté, une Ligne ou un Constat daté dedans', () => {
		const { i } = close();
		expect(
			code(i.app.operations.creer(i.ctx(), depenseSimple(i, { date: '2026-12-01' } as never)))
		).toBe('date_hors_exercice');
		const op = i.app.socle.depots.operations.journal().operations[0]!;
		expect(() => i.base.exec(`DELETE FROM ligne WHERE operation_id = ${op.id}`)).toThrow(
			'exercice_cloture'
		);
		expect(() =>
			i.base.exec(`UPDATE cote SET montant_centimes = 1 WHERE operation_id = ${op.id}`)
		).toThrow('exercice_cloture');
		expect(
			code(
				i.app.pointage.saisirSolde(i.ctx(), {
					compteId: i.banque,
					date: '2027-01-15',
					solde: c(1_00)
				})
			)
		).toBe('exercice_cloture');
	});

	it('laisse Pièces, `sans_piece` et `liaison_id` changer, et l’empreinte reste valable', () => {
		const { i } = close();
		const op = i.app.socle.depots.operations.journal().operations[0]!;
		valeur(i.app.operations.definirSansPiece(i.ctx(), { id: op.id, sansPiece: true }));
		const seconde = i.app.socle.depots.operations.journal().operations[1]!;
		valeur(
			i.app.operations.relier(i.ctx(), {
				id: op.id,
				autreId: seconde.id,
				libelle: 'Deux paiements'
			})
		);
		valeur(
			i.app.pieces.deposer(i.ctx(), {
				nomOriginal: 'apres.pdf',
				octets: new TextEncoder().encode('%PDF-1.4\n%x\n'),
				operationId: op.id
			})
		);
		expect(valeur(i.app.etats.verifier(i.ctx()))).toEqual([]);
	});

	it('un relevé d’après la clôture entre, reste pointable, son solde est ignoré', () => {
		const { i } = close();
		const ofx = [
			'OFXHEADER:100',
			'DATA:OFXSGML',
			'',
			'<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
			'<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20270815<TRNAMT>-42.00<FITID>F1<NAME>Cachet tardif</STMTTRN>',
			'</BANKTRANLIST><LEDGERBAL><BALAMT>123.45<DTASOF>20270816</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'
		].join('\n');
		const r = valeur(
			i.app.pointage.importer(i.ctx(), {
				compteId: i.banque,
				nomFichier: 'releve-fictif.txt',
				octets: new TextEncoder().encode(ofx)
			})
		) as { soldeIgnore?: boolean; nouvelles?: number };
		expect(r).toMatchObject({ nouvelles: 1 });
		expect(JSON.stringify(r)).toMatch(/ignor/i);

		const j = i.app.socle.depots.operations.journal();
		const ligne = j.lignesReleve[0]!;
		const proposee = valeur(i.app.pointage.ligneASaisir(i.ctx(), ligne.id));
		expect(proposee.date).toBe('2027-09-01');
		expect(proposee.rattachementId).toBe(i.exercice('2026-2027').id);

		const cree = valeur(
			i.app.pointage.creerDepuisLigne(i.ctx(), {
				ligneId: ligne.id,
				saisie: depenseSimple(i, {
					date: proposee.date,
					montant: c(42_00),
					lignes: [
						{
							montant: c(42_00),
							contraire: false,
							reduction: false,
							natureId: i.nature('Spectacle'),
							actionId: null,
							exerciceRattachementId: proposee.rattachementId,
							note: null
						}
					]
				} as never)
			})
		);
		expect(cree.pointageId).not.toBeNull();
		// La Ligne compte dans 2027-2028, hors résultat, au bloc antérieur.
		const { resultat } = valeur(i.app.etats.compteDeResultat(i.ctx(), i.exercice('2027-2028')));
		expect(resultat.resultat).toBe(0);
		expect(resultat.anterieurs.resultat).toBe(-42_00);
	});

	it('un Groupe renommé ou réordonné ne change rien aux états clôturés', () => {
		const { i, e, suivant } = close();
		const avant = valeur(i.app.etats.compteDeResultat(i.ctx(), i.exercice('2026-2027')));
		const groupes = i.app.socle.depots.parametrage.groupes();
		valeur(i.app.parametrage.renommerGroupe(i.ctx(), groupes[0]!.id, 'Renommé'));
		i.base.exec(`UPDATE groupe SET ordre = 100 - ordre`);
		const apres = valeur(i.app.etats.compteDeResultat(i.ctx(), i.exercice('2026-2027')));
		expect(apres).toEqual(avant);
		const courant = valeur(i.app.etats.compteDeResultat(i.ctx(), suivant));
		expect(courant.resultat.groupes.map((g) => g.libelle)).toContain('Renommé');
		expect(e.id).not.toBe(suivant.id);
		expect(valeur(i.app.etats.verifier(i.ctx()))).toEqual([]);
	});

	it('FR-2 : les soldes de départ et les restes suivants se recalculent, sans copie', () => {
		const { i, suivant } = close();
		const j = i.app.socle.depots.operations.journal();
		const t = valeur(i.app.etats.tresorerie(i.ctx(), suivant)).etat;
		expect(t.depart).toBe(ATTENDUS.soldeBanqueFin + ATTENDUS.soldeLivretFin);
		expect(j.ancres.every((a) => a.exerciceId === i.exercice('2026-2027').id)).toBe(true);
	});

	it('le Document d’AG sort sans filigrane, avec le paramétrage figé', () => {
		const { i, e } = close();
		const m = valeur(i.app.etats.modele(i.ctx(), 'document-ag', i.exercice('2026-2027')));
		expect(m.provisoire).toBe(false);
		expect(e.statut).toBe('ouvert');
	});
});

describe('Document d’AG', () => {
	it('garde les mêmes Groupes dans le même ordre d’un Exercice à l’autre', () => {
		const { i, e, suivant } = anneeTerminee();
		const libelles = (x: typeof e) => {
			const m = valeur(i.app.etats.modele(i.ctx(), 'document-ag', x));
			return m.sections[0]!.tableau!.rangees.filter((r) => r.niveau === 0).map(
				(r) => r.cellules[0]
			);
		};
		expect(libelles(e)).toEqual(libelles(suivant));
	});
});

describe('export complet', () => {
	it('la somme des Lignes du CSV égale le résultat calculé', async () => {
		const i = instanceFictive();
		jouerExerciceFictif(i);
		const { flux, nom } = valeur(i.app.etats.exportComplet(i.ctx()));
		expect(nom).toBe('export-complet-2026-11-04.zip');
		const octets = new Uint8Array(await new Response(flux).arrayBuffer());
		const archive = unzipSync(octets);
		const csv = strFromU8(archive['lignes.csv']!);
		const [entete, ...lignes] = csv.trim().split('\r\n');
		const colonnes = entete!.split(';');
		const montant = colonnes.indexOf('Montant de la Ligne');
		const resultat = colonnes.indexOf('Compte dans le résultat de');
		const somme = lignes
			.map((l) => l.split(';'))
			.filter((l) => l[resultat] === '2026-2027')
			.reduce((t, l) => t + Number(l[montant]!.replace(',', '').replace(/^'/, '')), 0);
		expect(somme).toBe(ATTENDUS.resultat);
		expect(strFromU8(archive['LISEZMOI.txt']!)).toContain('APE des Tilleuls');
	});
});

describe('ape verifier', () => {
	it('ne dit rien d’une base juste, et accepte une instance sans Accès', () => {
		const { i, e } = anneeTerminee();
		valeur(cloturer(i, e.id));
		expect(valeur(i.app.etats.verifier(i.app.ctx(null)))).toEqual([]);
	});

	it('nomme l’Exercice d’une ligne altérée à la main', () => {
		const { i, e } = anneeTerminee();
		valeur(cloturer(i, e.id));
		const op = i.app.socle.depots.operations.journal().operations[0]!;
		i.base.exec(`
			DROP TRIGGER ligne_verrou_maj;
			UPDATE ligne SET montant_centimes = montant_centimes - 1 WHERE operation_id = ${op.id};
		`);
		const v = valeur(i.app.etats.verifier(i.ctx()));
		expect(v.map((x) => x.invariant)).toContain('Empreinte de clôture');
		expect(v.map((x) => x.invariant)).toContain('O1');
		expect(v.map((x) => x.invariant)).toContain('Équation de contrôle');
		expect(v.every((x) => x.exercice === '2026-2027')).toBe(true);
	});

	it('signale un fichier de Pièce disparu (F7) et l’absence de Trésorier·e (A1)', () => {
		const i = instanceFictive();
		const id = creerOperation(i, depenseSimple(i));
		const p = valeur(
			i.app.pieces.deposer(i.ctx(), {
				nomOriginal: 'ticket.pdf',
				octets: new TextEncoder().encode('%PDF-1.4\n%x\n'),
				operationId: id
			})
		);
		expect(p.id).toBeGreaterThan(0);
		i.fichiers.clear();
		i.base.exec(`UPDATE acces SET revoque_le = '2026-11-04T10:00:00.000Z'`);
		const v = valeur(i.app.etats.verifier(i.app.ctx(null)));
		expect(v.map((x) => x.invariant).sort()).toEqual(['A1', 'F7']);
	});

	it('signale une clôture sans sa ligne de gel', () => {
		const i = instanceFictive();
		i.base.exec(`UPDATE exercice SET statut = 'cloture' WHERE libelle = '2026-2027'`);
		const v = valeur(i.app.etats.verifier(i.ctx()));
		expect(v.some((x) => x.message === 'Clôture introuvable.')).toBe(true);
	});
});
