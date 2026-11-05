import { describe, expect, it } from 'vitest';
import { centimes, formaterMontant, type Centimes } from '#lib/domaine/montant.ts';
import { colonneDe, soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type { EntreeCreation, EntreeOperation } from '#lib/server/application/operations/index.ts';
import { ATTENDUS, PARAMETRES, saisiesFictives } from '../jeux/exercice-fictif.ts';
import { banc, type Banc } from './aides/app.ts';

const c = centimes;

/** Instance prête : APE, Exercice 2026-2027 ouvert, repère 2025-2026, deux Comptes, Natures, Actions. */
function instance() {
	const b = banc('2026-11-04T10:00:00.000Z');
	const ctx = b.ctx();
	b.app.parametrage.enregistrerAssociation(ctx, {
		nom: 'APE des Tilleuls',
		adresse: '',
		moisDebutExercice: 9,
		mentionsFacture: ''
	});
	const dem = b.app.exercices.demarrer(ctx, {
		anneeDebut: 2026,
		comptes: PARAMETRES.comptes.map((x) => ({
			libelle: x.libelle,
			type: x.type,
			solde: x.solde
		}))
	});
	if (!dem.ok) throw new Error(dem.erreur.code);
	const groupe = b.app.socle.depots.parametrage.groupes()[0]!.id;
	for (const libelle of PARAMETRES.natures) {
		const r = b.app.parametrage.creerNature(ctx, { libelle, groupeId: groupe, neutre: false });
		if (!r.ok) throw new Error(r.erreur.code);
	}
	for (const libelle of PARAMETRES.actions) {
		const r = b.app.parametrage.creerAction(ctx, { libelle, groupeId: groupe, avecCaisse: false });
		if (!r.ok) throw new Error(r.erreur.code);
	}
	const p = b.app.socle.depots.parametrage;
	const [banque, livret] = p.comptes().map((x) => x.id) as [number, number];
	return {
		...b,
		banque,
		livret,
		nature: (nom: string) => p.natures().find((n) => n.libelle === nom)!.id,
		action: (nom: string) => p.actions().find((a) => a.libelle === nom)!.id,
		sommeARendre: p.natures().find((n) => n.codeSysteme === 'somme_a_rendre')!.id,
		exercice: (libelle: string) =>
			b.app.socle.depots.exercices.lister().find((e) => e.libelle === libelle)!
	};
}
type Instance = ReturnType<typeof instance>;

function depense(i: Instance, partiel: Partial<EntreeCreation> = {}): EntreeCreation {
	return {
		forme: 'standard',
		intention: 'depense',
		libelle: 'Papeterie fictive',
		reference: null,
		modePaiement: 'virement',
		note: null,
		tiers: null,
		compteId: i.banque,
		date: '2026-10-05',
		montant: c(100_00),
		lignes: [
			{
				montant: c(100_00),
				contraire: false,
				reduction: false,
				natureId: i.nature('Transport'),
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		],
		...partiel
	} as EntreeCreation;
}

function creer(i: Instance, e: EntreeCreation): number {
	const r = i.app.operations.creer(i.ctx(), e);
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur.id;
}

const code = (r: { ok: boolean; erreur?: { code: string } }) => (r.ok ? 'ok' : r.erreur?.code);

function pointer(b: Banc, coteId: number, compteId: number, montant: Centimes) {
	b.base.exec(`
		INSERT INTO ligne_releve (id, compte_id, date, montant_centimes, libelle, empreinte, cree_le)
			VALUES (1, ${compteId}, '2026-10-06', ${montant}, 'VIR FICTIF', 'e1', '2026-10-20T18:00:00.000Z');
		INSERT INTO pointage (id, compte_id, cree_le, cree_par) VALUES (1, ${compteId}, '2026-10-20T18:00:00.000Z', ${b.tresorier.id});
		INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (1, ${coteId});
		INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (1, 1);
	`);
}

describe('création (2.1)', () => {
	it('écrit Opération, Côté, Lignes, sans montant stocké, et l’entrée de Journal', () => {
		const i = instance();
		const id = creer(i, depense(i));
		const op = i.app.socle.depots.operations.parId(id)!;
		expect(op.cotes.map((x) => x.montant)).toEqual([-100_00]);
		expect(op.lignes.map((x) => x.montant)).toEqual([-100_00]);
		expect(op.lignes[0]?.exerciceRattachementId).toBe(i.exercice('2026-2027').id);
		const colonnes = i.base.prepare("SELECT name FROM pragma_table_info('operation')").all();
		expect(colonnes.map((x) => (x as { name: string }).name)).not.toContain('montant_centimes');
		const j = i.journal().at(-1)!;
		expect(j.evenement).toBe('operation.creee');
		expect(j.resume).toContain('Papeterie fictive');
		expect(j.resume).toContain('100,00');
	});

	it('O1 : une Opération déséquilibrée n’écrit rien', () => {
		const i = instance();
		const e = depense(i, { montant: c(90_00) } as Partial<EntreeCreation>);
		const avant = i.journal().length;
		expect(code(i.app.operations.creer(i.ctx(), e))).toBe('ventilation_incomplete');
		expect(i.app.socle.depots.operations.journal().operations).toEqual([]);
		expect(i.journal().length).toBe(avant);
	});

	it('O5 : une date hors d’un Exercice ouvert est refusée', () => {
		const i = instance();
		const e = depense(i, { date: '2026-03-12' } as Partial<EntreeCreation>);
		expect(code(i.app.operations.creer(i.ctx(), e))).toBe('date_hors_exercice');
	});

	it('O11 : une Nature inactive est refusée sur une nouvelle Ligne', () => {
		const i = instance();
		const natureId = i.nature('Transport');
		i.app.parametrage.activerNature(i.ctx(), natureId, false);
		expect(code(i.app.operations.creer(i.ctx(), depense(i)))).toBe('reference_inactive');
	});

	it('refuse sans droit de saisie', () => {
		const i = instance();
		const lecteur = { ...i.tresorier, role: 'lecteur' as const };
		expect(code(i.app.operations.creer(i.app.ctx(lecteur), depense(i)))).toBe('acces_refuse');
		expect(code(i.app.operations.creer(i.app.ctx(null), depense(i)))).toBe('acces_refuse');
	});

	it('une clé de saisie n’écrit qu’une fois, même rejouée', () => {
		const i = instance();
		const cle = 'cle-de-saisie-1';
		const a = i.app.operations.creer(i.ctx(), { ...depense(i), cle } as EntreeCreation);
		const b = i.app.operations.creer(i.ctx(), { ...depense(i), cle } as EntreeCreation);
		expect(a).toEqual(b);
		expect(i.app.socle.depots.operations.journal().operations).toHaveLength(1);
	});
});

describe('grand journal', () => {
	it('sépare les annulées et laisse vides les tableaux non livrés', () => {
		const i = instance();
		const a = creer(i, depense(i));
		const b = creer(i, depense(i, { libelle: 'Autre fictive' } as Partial<EntreeCreation>));
		i.app.operations.annuler(i.ctx(), a);
		const j = i.app.socle.depots.operations.journal();
		expect(j.operations.map((o) => o.id)).toEqual([b]);
		expect(j.operationsAnnulees.map((o) => o.id)).toEqual([a]);
		expect(j.comptages).toEqual([]);
		expect(j.sessions).toEqual([]);
		expect(j.chequesRecus).toEqual([]);
		expect(j.chequesEmis).toEqual([]);
	});

	it('n’agrège aucun montant en SQL', async () => {
		const { readFileSync } = await import('node:fs');
		const code = readFileSync('src/lib/server/infra/sqlite/depot-operations.ts', 'utf8');
		expect(/\bSUM\s*\(/i.test(code)).toBe(false);
	});
});

describe('correction (2.5)', () => {
	function modifier(i: Instance, id: number, partiel: Partial<EntreeOperation>, version = 1) {
		const saisie = { ...depense(i), ...partiel } as EntreeOperation;
		return i.app.operations.modifier(i.ctx(), { id, version, saisie });
	}

	it('modifie, incrémente la version et note avant et après', () => {
		const i = instance();
		const id = creer(i, depense(i));
		expect(modifier(i, id, { libelle: 'Papeterie corrigée' }).ok).toBe(true);
		const op = i.app.socle.depots.operations.parId(id)!;
		expect(op.libelle).toBe('Papeterie corrigée');
		expect(op.version).toBe(2);
		expect(i.journal().at(-1)?.evenement).toBe('operation.modifiee');
	});

	it('O10 : une version périmée est refusée', () => {
		const i = instance();
		const id = creer(i, depense(i));
		modifier(i, id, { libelle: 'Première personne' });
		const r = modifier(i, id, { libelle: 'Seconde personne' });
		expect(code(r)).toBe('modification_concurrente');
		expect(i.app.socle.depots.operations.parId(id)?.libelle).toBe('Première personne');
	});

	it('Côté pointé : montant et Compte verrouillés, libellé et note libres', () => {
		const i = instance();
		const id = creer(i, depense(i));
		const op = i.app.socle.depots.operations.parId(id)!;
		pointer(i, op.cotes[0]!.id, i.banque, op.cotes[0]!.montant);

		expect(code(modifier(i, id, { compteId: i.livret }))).toBe('cote_pointe');
		const moins = {
			montant: c(90_00),
			lignes: [{ ...(depense(i) as { lignes: object[] }).lignes[0]!, montant: c(90_00) }]
		} as Partial<EntreeOperation>;
		expect(code(modifier(i, id, moins))).toBe('cote_pointe');
		expect(modifier(i, id, { libelle: 'Libellé corrigé', note: 'Note' }).ok).toBe(true);
		expect(i.app.socle.depots.operations.parId(id)?.cotes[0]?.id).toBe(op.cotes[0]!.id);
	});

	it('O7 : l’Opération déplacée emmène ses Lignes courantes, pas les rattachements antérieurs', () => {
		const i = instance();
		i.app.exercices.ouvrirSuivant(i.ctx());
		const [e2026, e2027, repere] = [
			i.exercice('2026-2027'),
			i.exercice('2027-2028'),
			i.exercice('2025-2026')
		];
		const base = depense(i) as { lignes: Record<string, unknown>[] };
		const lignes = [
			{ ...base.lignes[0], montant: c(60_00), exerciceRattachementId: e2026.id },
			{ ...base.lignes[0], montant: c(40_00), exerciceRattachementId: repere.id }
		];
		const id = creer(i, { ...depense(i), lignes } as EntreeCreation);
		const r = modifier(i, id, {
			date: '2027-10-05',
			lignes
		} as Partial<EntreeOperation>);
		expect(r.ok).toBe(true);
		const op = i.app.socle.depots.operations.parId(id)!;
		expect(op.lignes.map((l) => l.exerciceRattachementId)).toEqual([e2027.id, repere.id]);
	});

	it('O9 : une Opération d’origine spécialisée ne change que libellé et note', () => {
		const i = instance();
		const id = creer(i, depense(i));
		i.base.exec(`UPDATE operation SET origine = 'recette_especes' WHERE id = ${id}`);
		expect(code(modifier(i, id, { compteId: i.livret }))).toBe('operation_geree_ailleurs');
		expect(code(modifier(i, id, { date: '2026-10-06' }))).toBe('operation_geree_ailleurs');
		expect(modifier(i, id, { libelle: 'Nouveau libellé', note: 'Une note' }).ok).toBe(true);
		const op = i.app.socle.depots.operations.parId(id)!;
		expect(op.origine).toBe('recette_especes');
		expect(code(i.app.operations.annuler(i.ctx(), id))).toBe('operation_geree_ailleurs');
	});

	it('O8 : l’annulation sort l’Opération du journal, le Journal la garde', () => {
		const i = instance();
		const id = creer(i, depense(i));
		expect(i.app.operations.annuler(i.ctx(), id).ok).toBe(true);
		const j = i.app.socle.depots.operations.journal();
		expect(j.operations).toEqual([]);
		expect(soldeCompte(j, i.banque, '2027-08-31')).toBe(PARAMETRES.comptes[0]!.solde);
		expect(i.journal().at(-1)?.evenement).toBe('operation.annulee');
		const detail = i.app.operations.detail(i.ctx(), id);
		expect(detail.ok && detail.valeur.annulee).toBe(true);
		expect(code(i.app.operations.annuler(i.ctx(), id))).toBe('operation_annulee');
		expect(code(modifier(i, id, { libelle: 'Trop tard' }))).toBe('operation_annulee');
	});

	it('O8 : une Opération pointée ne s’annule pas', () => {
		const i = instance();
		const id = creer(i, depense(i));
		const op = i.app.socle.depots.operations.parId(id)!;
		pointer(i, op.cotes[0]!.id, i.banque, op.cotes[0]!.montant);
		expect(code(i.app.operations.annuler(i.ctx(), id))).toBe('cote_pointe');
	});

	it('Exercice clôturé : ni modification, ni annulation', () => {
		const i = instance();
		const id = creer(i, depense(i));
		i.base.exec(`UPDATE exercice SET statut = 'cloture' WHERE libelle = '2026-2027'`);
		const r = modifier(i, id, { libelle: 'Trop tard' });
		expect(code(r)).toBe('exercice_cloture');
		if (!r.ok) expect(r.erreur.details?.exercice).toBe('2026-2027');
		expect(code(i.app.operations.annuler(i.ctx(), id))).toBe('exercice_cloture');
		const d = i.app.operations.detail(i.ctx(), id);
		expect(d.ok && d.valeur.figeePar).toBe('2026-2027');
	});

	it('une Opération inconnue reste une erreur prévue', () => {
		const i = instance();
		expect(code(modifier(i, 999, {}))).toBe('element_introuvable');
		expect(code(i.app.operations.annuler(i.ctx(), 999))).toBe('element_introuvable');
		expect(code(i.app.operations.detail(i.ctx(), 999))).toBe('element_introuvable');
	});

	it('une clé rejouée ne déclenche pas de faux conflit', () => {
		const i = instance();
		const id = creer(i, depense(i));
		const e = { id, version: 1, cle: 'cle-modif-1', saisie: depense(i) as EntreeOperation };
		expect(i.app.operations.modifier(i.ctx(), e).ok).toBe(true);
		expect(i.app.operations.modifier(i.ctx(), e).ok).toBe(true);
	});
});

describe('jeu fictif complet (2.7 à 2.11)', () => {
	function jouer() {
		const i = instance();
		const saisies = saisiesFictives({
			banque: i.banque,
			livret: i.livret,
			nature: i.nature,
			action: i.action,
			sommeARendre: i.sommeARendre
		});
		const ids = new Map(saisies.map((s) => [s.cas, creer(i, s)]));
		const id = (debut: string) =>
			[...ids.entries()].find(([cas]) => cas.startsWith(debut))?.[1] as number;
		return { i, id, ids };
	}

	it('tombe juste au centime sur les soldes', () => {
		const { i, id } = jouer();
		const recue = id('FR-8 : trop-perçu');
		creer(i, {
			...depense(i, {
				date: '2026-11-30',
				libelle: 'Trop-perçu rendu',
				lignes: [
					{
						montant: c(100_00),
						contraire: false,
						reduction: false,
						natureId: i.sommeARendre,
						actionId: null,
						exerciceRattachementId: null,
						note: null
					}
				]
			} as Partial<EntreeCreation>),
			rendDe: recue
		} as EntreeCreation);

		const j = i.app.socle.depots.operations.journal();
		expect(soldeCompte(j, i.banque, '2027-08-31')).toBe(ATTENDUS.soldeBanqueFin);
		expect(soldeCompte(j, i.livret, '2027-08-31')).toBe(ATTENDUS.soldeLivretFin);
		expect(soldeCompte(j, i.banque, '2026-09-30')).toBe(ATTENDUS.soldeBanqueAu30Septembre);
		expect(soldeCompte(j, i.livret, '2026-09-30')).toBe(ATTENDUS.soldeLivretAu30Septembre);

		// La somme à rendre se relie, et son résultat est nul.
		const d = i.app.operations.detail(i.ctx(), recue);
		expect(d.ok && d.valeur.liaison?.type).toBe('somme_a_rendre');
		expect(d.ok && d.valeur.resteARendre).toBe(0);
		const neutres = j.operations
			.flatMap((o) => o.lignes)
			.filter((l) => l.natureId === i.sommeARendre);
		expect(neutres.reduce((t, l) => t + l.montant, 0)).toBe(ATTENDUS.effetSommeARendre);
	});

	it('FR-7 : un Mouvement interne n’a aucune Ligne', () => {
		const { i, id } = jouer();
		const op = i.app.socle.depots.operations.parId(id('FR-7'))!;
		expect(op.genre).toBe('interne');
		expect(op.lignes).toEqual([]);
		expect(op.date).toBe('2026-09-30');
		expect(op.cotes.map((x) => [x.date, x.montant])).toEqual([
			['2026-09-30', -200_00],
			['2026-10-01', 200_00]
		]);
	});

	it('FR-8 : un remboursement réduit la dépense, rangé en Dépense', () => {
		const { i, id } = jouer();
		const op = i.app.socle.depots.operations.parId(id('FR-8 : remboursement'))!;
		const l = op.lignes[0]!;
		expect(l.estReduction).toBe(true);
		expect(colonneDe(l)).toBe('depense');
		const lignes = i.app.socle.depots.operations
			.journal()
			.operations.flatMap((o) => o.lignes)
			.filter((x) => x.natureId === i.nature('Fournitures'));
		const net = lignes.reduce((t, x) => t + x.montant, 0);
		expect(-net).toBe(ATTENDUS.depenseNettePapeterie);
	});

	it('FR-9 : seul le différentiel touche le Compte', () => {
		const { i, id } = jouer();
		const op = i.app.socle.depots.operations.parId(id('FR-9'))!;
		expect(op.lignes.map((l) => l.montant)).toEqual([300_00, -500_00]);
		expect(op.cotes.map((x) => x.montant)).toEqual([ATTENDUS.differentielPhotographe]);
	});

	it('FR-10 : relier affiche le total, délier et annuler le recalculent, sans toucher aux Lignes', () => {
		const { i, id } = jouer();
		const [cachet, cotisations] = [id('FR-10 : cachet'), id('FR-10 : cotisations')];
		const lignesAvant = i.app.socle.depots.operations.journal().operations.flatMap((o) => o.lignes);

		const r = i.app.operations.relier(i.ctx(), {
			id: cachet,
			autreId: cotisations,
			libelle: 'Spectacle'
		});
		expect(r.ok).toBe(true);
		const d = i.app.operations.detail(i.ctx(), cachet);
		expect(d.ok && d.valeur.liaison?.total).toBe(ATTENDUS.coutSpectacle);
		expect(d.ok && d.valeur.liaison?.phrase).toBe(
			`Fait partie de : Spectacle, ${formaterMontant(c(400_00))} au total, 220 + 180`
		);
		expect(i.app.socle.depots.operations.journal().operations.flatMap((o) => o.lignes)).toEqual(
			lignesAvant
		);

		i.app.operations.annuler(i.ctx(), cotisations);
		const apres = i.app.operations.detail(i.ctx(), cachet);
		expect(apres.ok && apres.valeur.liaison?.total).toBe(220_00);
	});

	it('FR-10 : délier retire la liaison qui ne relie plus rien', () => {
		const { i, id } = jouer();
		const [a, b] = [id('FR-10 : cachet'), id('FR-10 : cotisations')];
		i.app.operations.relier(i.ctx(), { id: a, autreId: b, libelle: 'Spectacle' });
		expect(i.app.operations.delier(i.ctx(), a).ok).toBe(true);
		const j = i.app.socle.depots.operations.journal();
		expect(j.liaisons).toEqual([]);
		expect(j.operations.every((o) => o.liaisonId === null)).toBe(true);
		expect(code(i.app.operations.delier(i.ctx(), a))).toBe('liaison_invalide');
	});

	it('FR-10 : deux liaisons fusionnent, une troisième Opération rejoint', () => {
		const { i, id } = jouer();
		const [a, b, x, y] = [id('FR-10 : cachet'), id('FR-10 : cotisations'), id('FR-4'), id('FR-5')];
		i.app.operations.relier(i.ctx(), { id: a, autreId: b, libelle: 'Spectacle' });
		i.app.operations.relier(i.ctx(), { id: x, autreId: y, libelle: 'Autre' });
		expect(i.app.operations.relier(i.ctx(), { id: a, autreId: x, libelle: 'Spectacle' }).ok).toBe(
			true
		);
		const j = i.app.socle.depots.operations.journal();
		expect(j.liaisons).toHaveLength(1);
		const d = i.app.operations.detail(i.ctx(), y);
		expect(d.ok && d.valeur.liaison?.operations).toHaveLength(4);
		expect(code(i.app.operations.relier(i.ctx(), { id: a, autreId: b, libelle: 'x' }))).toBe(
			'liaison_invalide'
		);
		expect(code(i.app.operations.relier(i.ctx(), { id: a, autreId: 999, libelle: 'x' }))).toBe(
			'element_introuvable'
		);
	});

	it('AD-5 : une liaison s’enregistre sur un Exercice clôturé sans y rien changer', () => {
		const i = instance();
		i.app.exercices.ouvrirSuivant(i.ctx());
		const aout = creer(
			i,
			depense(i, { date: '2027-08-20', libelle: 'Cachet d’août' } as Partial<EntreeCreation>)
		);
		const octobre = creer(
			i,
			depense(i, { date: '2027-10-05', libelle: 'Cotisations' } as Partial<EntreeCreation>)
		);
		i.base.exec(`UPDATE exercice SET statut = 'cloture' WHERE libelle = '2026-2027'`);
		const avant = i.app.socle.depots.operations.parId(aout)!;
		const r = i.app.operations.relier(i.ctx(), { id: aout, autreId: octobre, libelle: 'Cachet' });
		expect(r.ok).toBe(true);
		const apres = i.app.socle.depots.operations.parId(aout)!;
		expect({ ...apres, liaisonId: null }).toEqual({ ...avant, liaisonId: null });
		expect(apres.liaisonId).not.toBeNull();
	});
});

describe('rattachement (2.7)', () => {
	it('O6 : refuse un Exercice postérieur, accepte un repère', () => {
		const i = instance();
		i.app.exercices.ouvrirSuivant(i.ctx());
		const base = depense(i) as { lignes: Record<string, unknown>[] };
		const avec = (id: number) =>
			({
				...depense(i),
				lignes: [{ ...base.lignes[0], exerciceRattachementId: id }]
			}) as EntreeCreation;
		expect(code(i.app.operations.creer(i.ctx(), avec(i.exercice('2027-2028').id)))).toBe(
			'rattachement_invalide'
		);
		const id = creer(i, avec(i.exercice('2025-2026').id));
		const op = i.app.socle.depots.operations.parId(id)!;
		expect(op.lignes[0]?.exerciceRattachementId).toBe(i.exercice('2025-2026').id);
	});

	it('une Ligne rattachée à un Exercice clôturé n’écrit rien dans cet Exercice', () => {
		const i = instance();
		i.base.exec(`
			UPDATE exercice SET debut = '2025-09-01', fin = '2026-08-31', statut = 'cloture'
			WHERE libelle = '2025-2026'
		`);
		const clos = i.exercice('2025-2026');
		const base = depense(i) as { lignes: Record<string, unknown>[] };
		const id = creer(i, {
			...depense(i),
			lignes: [{ ...base.lignes[0], exerciceRattachementId: clos.id }]
		} as EntreeCreation);
		const j = i.app.socle.depots.operations.journal();
		const dansClos = j.operations.filter((o) => o.date >= clos.debut! && o.date <= clos.fin!);
		expect(dansClos).toEqual([]);
		expect(i.app.socle.depots.operations.parId(id)?.date).toBe('2026-10-05');
	});
});

describe('consultation', () => {
	it('recherche paginée et rangée lisible', () => {
		const i = instance();
		creer(i, depense(i));
		const r = i.app.operations.rechercher(i.ctx(), { texte: 'papeterie' }, 1);
		expect(r.ok && r.valeur.total).toBe(1);
		const rangee = r.ok ? r.valeur.rangees[0] : null;
		expect(rangee).toMatchObject({
			libelle: 'Papeterie fictive',
			compte: 'Banque des Tilleuls',
			natures: 'Transport',
			actions: 'Sans Action',
			montant: -100_00,
			etat: 'a_pointer',
			annulee: false
		});
	});

	it('exporte un CSV pour Excel français, sans vocabulaire interdit', () => {
		const i = instance();
		creer(i, depense(i));
		creer(i, {
			forme: 'interne',
			libelle: '=Virement ; "test"',
			note: null,
			reference: null,
			deId: i.banque,
			versId: i.livret,
			montant: c(1234_56),
			parti: '2026-10-07',
			arrive: '2026-10-08'
		});
		const r = i.app.operations.exporter(i.ctx(), {});
		expect(r.ok).toBe(true);
		const csv = r.ok ? r.valeur : '';
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		const lignes = csv.slice(1).split('\r\n');
		expect(lignes[0]).toContain('Date;Libellé;Compte;Nature;Action');
		expect(csv).toContain('-100,00');
		expect(csv).toContain('1234,56');
		expect(csv).toContain(`"'=Virement ; ""test"""`);
		expect(csv).not.toMatch(/débit|crédit|écriture|contrepartie/i);
	});

	it('le lecteur consulte, sans saisir', () => {
		const i = instance();
		const lecteur = i.app.ctx({ ...i.tresorier, role: 'lecteur' });
		expect(i.app.operations.rechercher(lecteur, {}, 1).ok).toBe(true);
		expect(code(i.app.operations.suggestion(lecteur, 'auto', 'depense'))).toBe('acces_refuse');
		expect(code(i.app.operations.candidats(lecteur, 'auto', null, null))).toBe('acces_refuse');
		const compteur = i.app.ctx({ ...i.tresorier, role: 'compteur' });
		expect(code(i.app.operations.rechercher(compteur, {}, 1))).toBe('acces_refuse');
		expect(code(i.app.operations.detail(compteur, 1))).toBe('acces_refuse');
		expect(code(i.app.operations.exporter(compteur, {}))).toBe('acces_refuse');
	});

	it('suggère d’après l’historique et propose des candidats', () => {
		const i = instance();
		creer(i, depense(i, { libelle: 'Autocars du Sud' } as Partial<EntreeCreation>));
		const s = i.app.operations.suggestion(i.ctx(), 'autocar', 'depense');
		expect(s.ok && s.valeur?.natureId).toBe(i.nature('Transport'));
		expect(s.ok && s.valeur?.note).toBe('Comme “Autocars du Sud” en octobre');
		const cands = i.app.operations.candidats(i.ctx(), 'autocar', 'depense', null);
		expect(cands.ok && cands.valeur.length).toBe(1);
		const sauf = i.app.operations.candidats(i.ctx(), 'autocar', 'recette', null);
		expect(sauf.ok && sauf.valeur.length).toBe(0);
	});

	it('la palette trouve Opérations et Actions', () => {
		const i = instance();
		creer(i, depense(i));
		const r = i.app.operations.palette(i.ctx(), 'kermesse');
		expect(r.ok && r.valeur.actions.map((a) => a.libelle)).toEqual(['Kermesse']);
		const m = i.app.operations.palette(i.ctx(), '100');
		expect(m.ok && m.valeur.operations).toHaveLength(1);
	});

	it('expose le contexte de saisie et les récents', () => {
		const i = instance();
		creer(i, depense(i));
		const ctx = i.app.operations.contexteSaisie(i.ctx());
		expect(ctx.ok && ctx.valeur.recents.natures).toEqual([i.nature('Transport')]);
		expect(ctx.ok && ctx.valeur.natureSommeARendre).toBe(i.sommeARendre);
	});
});

describe('propriété du module', () => {
	it('seul depot-operations écrit dans operation, cote, ligne et liaison', async () => {
		const { sources } = await import('../projet/fichiers.ts');
		const fautifs = sources('src', ['.ts', '.svelte'])
			.filter(({ chemin }) => !chemin.endsWith('infra/sqlite/depot-operations.ts'))
			.filter(({ contenu }) =>
				/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:operation|cote|ligne|liaison)\b/.test(contenu)
			)
			.map((f) => f.chemin);
		expect(fautifs).toEqual([]);
	});
});
