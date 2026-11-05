import { beforeEach, describe, expect, it } from 'vitest';
import { resteDu } from '#lib/domaine/creances/index.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { EntreeCreance } from '#lib/domaine/creances/index.ts';
import { composer } from '#lib/server/composition.ts';
import { baseAvecCloture } from './aides/base.ts';
import { instancePrete, valeur } from './aides/instance.ts';

let i: ReturnType<typeof instancePrete>;
const creances = () => i.app.creances;
const compter = (table: string) =>
	i.base.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;

const somme = (partiel: Partial<EntreeCreance> = {}): EntreeCreance => ({
	sens: 'creance',
	tiers: 'Mairie fictive',
	motif: 'Subvention',
	montant: centimes(300_00),
	date: '2026-09-15',
	actionId: null,
	note: null,
	...partiel
});

const ajouter = (partiel: Partial<EntreeCreance> = {}) =>
	valeur(creances().ajouter(i.ctx(), somme(partiel))).id;

const solder = (id: number, montant: number, partiel = {}) =>
	creances().solder(i.ctx(), {
		parts: [{ creanceId: id, montant: centimes(montant) }],
		saisie: i.saisie('recette', montant, partiel)
	});

const reste = (id: number, d: string) => {
	const j = valeur(i.app.operations.journal(i.ctx()));
	return resteDu(
		j.creancesDettes.find((c) => c.id === id)!,
		j,
		d
	);
};

const lecteur = () => ({ ...i.tresorier, role: 'lecteur' as const });

beforeEach(() => {
	i = instancePrete();
});

describe('enregistrer une somme en attente', () => {
	it('ne crée ni Ligne ni Côté (AD-12)', () => {
		ajouter();
		expect(compter('creance_dette')).toBe(1);
		expect(compter('operation')).toBe(0);
		expect(compter('ligne')).toBe(0);
		expect(compter('cote')).toBe(0);
		expect(i.journal().at(-1)?.evenement).toBe('creance.creee');
		expect(i.journal().at(-1)?.resume).toContain('la Créance « Mairie fictive, Subvention »');
	});

	it('range à recevoir et à payer, avec Action et totaux', () => {
		ajouter({ actionId: i.actionId });
		ajouter({
			sens: 'dette',
			tiers: 'Sam Fictif',
			motif: 'Avance goûter',
			montant: centimes(42_00)
		});
		const s = valeur(creances().suivi(i.ctx(), i.courant));
		expect(s.aRecevoir.total).toBe(300_00);
		expect(s.aRecevoir.rangees[0]).toMatchObject({ tiers: 'Mairie fictive', action: 'Kermesse' });
		expect(s.aPayer.total).toBe(42_00);
		expect(s.aPayer.rangees[0]).toMatchObject({ motif: 'Avance goûter', reste: 42_00 });
		expect(s.date).toBe('2027-08-31');
	});

	it('annuler la retire, à partir de ce jour seulement, et se rétablit', () => {
		const id = ajouter();
		i.horloge.instant = '2026-11-10T10:00:00.000Z';
		valeur(creances().annuler(i.ctx(), id));
		expect(reste(id, '2026-11-09')).toBe(300_00);
		expect(reste(id, '2026-11-10')).toBe(0);
		expect(valeur(creances().suivi(i.ctx(), i.courant)).aRecevoir.rangees).toEqual([]);
		expect(creances().annuler(i.ctx(), id)).toEqual({
			ok: false,
			erreur: { code: 'creance_annulee' }
		});
		valeur(creances().retablir(i.ctx(), id));
		expect(reste(id, '2026-11-10')).toBe(300_00);
		expect(i.journal().map((e) => e.evenement)).toEqual(
			expect.arrayContaining(['creance.annulee', 'creance.retablie'])
		);
		valeur(creances().retablir(i.ctx(), id));
	});

	it('refuse d’annuler ce qui n’existe pas', () => {
		const refus = { ok: false, erreur: { code: 'element_introuvable' } };
		expect(creances().annuler(i.ctx(), 99)).toEqual(refus);
		expect(creances().retablir(i.ctx(), 99)).toEqual(refus);
		expect(creances().aSolder(i.ctx(), 99)).toEqual(refus);
	});

	it('un·e lecteur·rice consulte sans rien changer', () => {
		const id = ajouter();
		const ctx = i.app.ctx(lecteur());
		expect(valeur(creances().suivi(ctx, i.courant)).aRecevoir.total).toBe(300_00);
		const refus = { ok: false, erreur: { code: 'acces_refuse' } };
		expect(creances().ajouter(ctx, somme())).toEqual(refus);
		expect(creances().annuler(ctx, id)).toEqual(refus);
		expect(creances().retablir(ctx, id)).toEqual(refus);
		expect(creances().aSolder(ctx, id)).toEqual(refus);
		expect(creances().solder(ctx, { parts: [], saisie: i.saisie('recette', 100) })).toEqual(refus);
	});

	it('un·e compteur·se ne lit pas ce suivi', () => {
		const ctx = i.app.ctx({ ...i.tresorier, role: 'compteur' });
		expect(creances().suivi(ctx, i.courant)).toEqual({
			ok: false,
			erreur: { code: 'acces_refuse' }
		});
	});
});

describe('solder une somme', () => {
	it('crée l’Opération et le règlement dans la même transaction', () => {
		const id = ajouter();
		const op = valeur(solder(id, 300_00)).id;
		expect(compter('reglement')).toBe(1);
		expect(reste(id, '2026-12-01')).toBe(0);
		expect(valeur(i.app.operations.detail(i.ctx(), op)).soldes).toMatchObject([
			{ creanceId: id, tiers: 'Mairie fictive', montant: 300_00 }
		]);
		expect(valeur(creances().suivi(i.ctx(), i.courant)).aRecevoir.rangees).toEqual([]);
	});

	it('un refus ne laisse rien : ni Opération, ni règlement', () => {
		const id = ajouter();
		const r = solder(id, 300_00, { date: '2020-01-01' });
		expect(r.ok).toBe(false);
		expect(compter('operation')).toBe(0);
		expect(compter('reglement')).toBe(0);
		const pieces = creances().solder(i.ctx(), {
			parts: [{ creanceId: id, montant: centimes(100) }],
			saisie: i.saisie('recette', 100),
			pieces: [99]
		});
		expect(pieces.ok).toBe(false);
		expect(compter('operation')).toBe(0);
		expect(compter('reglement')).toBe(0);
	});

	it('un paiement partiel laisse le reste dû, et la ligne visible', () => {
		const id = ajouter();
		valeur(solder(id, 100_00));
		expect(reste(id, '2026-12-01')).toBe(200_00);
		const [r] = valeur(creances().suivi(i.ctx(), i.courant)).aRecevoir.rangees;
		expect(r).toMatchObject({ reste: 200_00, montant: 300_00 });
		expect(valeur(creances().aSolder(i.ctx(), id)).reste).toBe(200_00);
	});

	it('F1 : refuse un règlement au-delà du montant', () => {
		const id = ajouter();
		valeur(solder(id, 200_00));
		expect(solder(id, 100_01)).toEqual({ ok: false, erreur: { code: 'reglement_excessif' } });
		expect(compter('reglement')).toBe(1);
		valeur(solder(id, 100_00));
		expect(creances().aSolder(i.ctx(), id).ok).toBe(false);
	});

	it('F2 : une Opération annulée fait remonter le reste, sans changer le passé', () => {
		const id = ajouter();
		const op = valeur(solder(id, 300_00)).id;
		expect(reste(id, '2026-10-04')).toBe(300_00);
		expect(reste(id, '2026-10-05')).toBe(0);
		valeur(i.app.operations.annuler(i.ctx(), op));
		expect(reste(id, '2026-10-05')).toBe(300_00);
		expect(reste(id, '2026-10-04')).toBe(300_00);
		// F1 : la somme peut de nouveau se solder entièrement.
		valeur(solder(id, 300_00, { date: '2026-10-20' }));
		expect(reste(id, '2026-10-19')).toBe(300_00);
		expect(reste(id, '2026-10-20')).toBe(0);
	});

	it('une Opération solde plusieurs sommes, chaque règlement porte sa part', () => {
		const a = ajouter({ sens: 'dette', montant: centimes(100_00), tiers: 'Sam Fictif' });
		const b = ajouter({ sens: 'dette', montant: centimes(250_00), tiers: 'Alex Fictif' });
		const op = valeur(
			creances().solder(i.ctx(), {
				parts: [
					{ creanceId: a, montant: centimes(100_00) },
					{ creanceId: b, montant: centimes(150_00) }
				],
				saisie: i.saisie('depense', 250_00)
			})
		).id;
		const lignes = i.base
			.prepare('SELECT creance_dette_id, montant_centimes FROM reglement WHERE operation_id = ?')
			.all(op);
		expect(lignes).toEqual([
			{ creance_dette_id: a, montant_centimes: 100_00 },
			{ creance_dette_id: b, montant_centimes: 150_00 }
		]);
		expect(reste(a, '2026-12-01')).toBe(0);
		expect(reste(b, '2026-12-01')).toBe(100_00);
		expect(valeur(creances().ouvertes(i.ctx())).map((s) => s.id)).toEqual([b]);
	});

	it('une Opération corrigée doit encore couvrir ses parts', () => {
		const id = ajouter();
		const op = valeur(solder(id, 300_00)).id;
		const version = valeur(i.app.operations.detail(i.ctx(), op)).operation.version;
		expect(
			i.app.operations.modifier(i.ctx(), {
				id: op,
				version,
				saisie: i.saisie('recette', 100_00)
			})
		).toEqual({ ok: false, erreur: { code: 'reglement_depasse_operation' } });
	});

	it('une clé de saisie ne règle qu’une fois', () => {
		const id = ajouter();
		const envoi = {
			parts: [{ creanceId: id, montant: centimes(100_00) }],
			saisie: i.saisie('recette', 100_00),
			cle: 'cle-de-saisie-1'
		};
		const a = valeur(creances().solder(i.ctx(), envoi));
		const b = valeur(creances().solder(i.ctx(), envoi));
		expect(b.id).toBe(a.id);
		expect(compter('reglement')).toBe(1);
	});

	it('les Pièces de la saisie se rattachent à l’Opération', () => {
		const id = ajouter();
		const p = valeur(
			i.app.pieces.deposer(i.ctx(), {
				nomOriginal: 'avis.pdf',
				octets: new TextEncoder().encode('%PDF-1.7'),
				operationId: null
			})
		);
		const op = valeur(
			creances().solder(i.ctx(), {
				parts: [{ creanceId: id, montant: centimes(100_00) }],
				saisie: i.saisie('recette', 100_00),
				pieces: [p.id]
			})
		).id;
		expect(valeur(i.app.operations.detail(i.ctx(), op)).pieces).toHaveLength(1);
	});
});

describe('Exercice clôturé', () => {
	function cloture() {
		const base = baseAvecCloture();
		const app = composer({
			base,
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
		return { app, ctx };
	}

	it('refuse une somme datée dans un Exercice clôturé', () => {
		const { app, ctx } = cloture();
		const r = app.creances.ajouter(ctx, somme({ date: '2026-03-01' }));
		expect(r).toMatchObject({ ok: false, erreur: { code: 'exercice_cloture' } });
	});

	it('une somme née avant la clôture se solde sur un Exercice ouvert (F2)', () => {
		const { app, ctx } = cloture();
		const j = valeur(app.operations.journal(ctx));
		const avant = j.creancesDettes.find((c) => c.id === 1)!;
		expect(resteDu(avant, j, '2026-08-31')).toBe(499_00);
		expect(valeur(app.creances.aSolder(ctx, 1)).rattachementId).toBe(1);
		// Le reste dû à la clôture ne bouge pas, quoi qu'il arrive ensuite.
		const op = app.operations.annuler(ctx, 1);
		expect(op).toMatchObject({ ok: false, erreur: { code: 'exercice_cloture' } });
		const apres = valeur(app.operations.journal(ctx));
		expect(resteDu(avant, apres, '2026-08-31')).toBe(499_00);
	});
});

describe('reprise de l’année passée (FR-40)', () => {
	const reprise = () => '2026-08-31';

	it('datée d’avant l’ancre, elle apparaît sans toucher au résultat', () => {
		const id = ajouter({ date: reprise(), sens: 'dette', tiers: 'Sam Fictif', motif: 'Avance' });
		expect(compter('ligne')).toBe(0);
		expect(valeur(creances().suivi(i.ctx(), i.courant)).aPayer.rangees.map((r) => r.id)).toEqual([
			id
		]);
		expect(valeur(creances().reprises(i.ctx(), reprise())).map((r) => r.id)).toEqual([id]);
	});

	it('propose le rattachement à l’Exercice d’origine, et O6 l’accepte', () => {
		const id = ajouter({ date: reprise(), sens: 'dette', tiers: 'Sam Fictif', motif: 'Avance' });
		const s = valeur(creances().aSolder(i.ctx(), id));
		expect(s).toMatchObject({ rattachementId: i.repere.id, exerciceOrigine: i.repere.libelle });

		const saisie = i.saisie('depense', 300_00);
		const op = valeur(
			creances().solder(i.ctx(), {
				parts: [{ creanceId: id, montant: centimes(300_00) }],
				saisie: {
					...saisie,
					lignes: saisie.lignes.map((l) => ({ ...l, exerciceRattachementId: i.repere.id }))
				}
			})
		).id;
		const ligne = i.base
			.prepare('SELECT exercice_rattachement_id FROM ligne WHERE operation_id = ?')
			.pluck()
			.get(op);
		expect(ligne).toBe(i.repere.id);
		expect(valeur(creances().reprises(i.ctx(), reprise()))).toEqual([]);
	});
});
