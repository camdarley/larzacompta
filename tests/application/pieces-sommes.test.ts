import { beforeEach, describe, expect, it } from 'vitest';
import type { EntreeCreance } from '#lib/domaine/creances/index.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { instancePrete, valeur } from './aides/instance.ts';

/**
 * Retour d'usage du 09/11/2026 : la facture du transport du Cross arrive avant son paiement. Elle
 * se joint à la Dette, puis suit l'Opération qui la solde.
 */
let i: ReturnType<typeof instancePrete>;
const PDF = new TextEncoder().encode('%PDF-1.7\nfacture fictive');
const AUTRE = new TextEncoder().encode('%PDF-1.7\nautre facture');
const pieces = () => i.app.pieces;
const creances = () => i.app.creances;
const compter = (table: string) =>
	i.base.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;

const dette = (partiel: Partial<EntreeCreance & { pieces: number[] }> = {}) =>
	valeur(
		creances().ajouter(i.ctx(), {
			sens: 'dette',
			tiers: 'Autocars fictifs',
			motif: 'Transport du Cross',
			montant: centimes(180_00),
			date: '2026-10-31',
			actionId: null,
			note: null,
			...partiel
		})
	).id;

const deposer = (creanceId: number | null = null, octets = PDF) =>
	valeur(
		pieces().deposer(i.ctx(), {
			nomOriginal: 'facture-cross.pdf',
			octets,
			operationId: null,
			creanceId
		})
	);

const payer = (id: number, montant = 180_00, date = '2026-11-09') =>
	valeur(
		creances().solder(i.ctx(), {
			parts: [{ creanceId: id, montant: centimes(montant) }],
			saisie: i.saisie('depense', montant, { date })
		})
	).id;

const piecesDe = (operationId: number) =>
	valeur(i.app.operations.detail(i.ctx(), operationId)).pieces.map((p) => p.id);

const manquantes = () => valeur(pieces().compterManquantes(i.ctx(), i.courant));

beforeEach(() => {
	i = instancePrete();
});

describe('Pièce d’une Créance ou d’une Dette', () => {
	it('se dépose avec la Dette, puis se joint au paiement qui la solde', () => {
		const p = deposer();
		const id = dette({ pieces: [p.id] });
		expect(compter('piece_creance_dette')).toBe(1);
		const [r] = valeur(creances().suivi(i.ctx(), i.courant)).aPayer.rangees;
		expect(r?.pieces.map((x) => x.id)).toEqual([p.id]);
		expect(valeur(pieces().parId(i.ctx(), p.id)).sommes).toMatchObject([
			{ id, sens: 'dette', tiers: 'Autocars fictifs' }
		]);
		expect(valeur(creances().aSolder(i.ctx(), id)).pieces.map((x) => x.id)).toEqual([p.id]);

		const op = payer(id);
		expect(piecesDe(op)).toEqual([p.id]);
		expect(manquantes()).toBe(0);
		expect(i.journal().map((e) => e.evenement)).toEqual(
			expect.arrayContaining(['piece.rattachee', 'creance.reglee'])
		);
	});

	it('jointe après coup, elle suit les paiements déjà faits, pas un paiement annulé', () => {
		const id = dette();
		const premier = payer(id, 80_00, '2026-11-02');
		const annule = payer(id, 50_00, '2026-11-05');
		valeur(i.app.operations.annuler(i.ctx(), annule));
		expect(manquantes()).toBe(1);

		const p = deposer(id);
		expect(piecesDe(premier)).toEqual([p.id]);
		expect(compter('piece_operation')).toBe(1);
		expect(manquantes()).toBe(0);

		// Le reste se paie plus tard : la facture le justifie aussi.
		const second = payer(id, 100_00, '2026-11-20');
		expect(piecesDe(second)).toEqual([p.id]);
		expect(valeur(pieces().parId(i.ctx(), p.id)).operations.map((o) => o.id)).toEqual([
			premier,
			second
		]);
	});

	it('se retire de la somme sans toucher l’Opération qui la porte, et revient', () => {
		const p = deposer();
		const id = dette({ pieces: [p.id] });
		const op = payer(id, 100_00);
		valeur(pieces().detacher(i.ctx(), { pieceId: p.id, creanceId: id }));
		expect(compter('piece_creance_dette')).toBe(0);
		expect(piecesDe(op)).toEqual([p.id]);
		// Une seconde fois : rien n'a changé, rien à noter.
		const notes = i.journal().length;
		valeur(pieces().detacher(i.ctx(), { pieceId: p.id, creanceId: id }));
		expect(i.journal().length).toBe(notes);
		valeur(pieces().rattacher(i.ctx(), { pieceId: p.id, creanceId: id }));
		expect(compter('piece_creance_dette')).toBe(1);
	});

	it('une Pièce jointe à une somme ne se supprime pas, et n’attend plus dans Pièces', () => {
		const p = deposer();
		dette({ pieces: [p.id] });
		expect(pieces().supprimer(i.ctx(), p.id)).toEqual({
			ok: false,
			erreur: { code: 'piece_utilisee' }
		});
		const enAttente = valeur(pieces().lister(i.ctx(), { etat: 'en_attente' }, 1));
		expect(enAttente.total).toBe(0);
		expect(valeur(pieces().lister(i.ctx(), { texte: 'autocars' }, 1)).total).toBe(1);
	});

	it('refuse une somme ou une Pièce inconnue, et rien ne reste', () => {
		const p = deposer();
		const refus = { ok: false, erreur: { code: 'element_introuvable' } };
		expect(pieces().rattacher(i.ctx(), { pieceId: p.id, creanceId: 99 })).toEqual(refus);
		expect(pieces().detacher(i.ctx(), { pieceId: p.id, creanceId: 99 })).toEqual(refus);
		expect(pieces().rattacher(i.ctx(), { pieceId: 99, creanceId: dette() })).toEqual(refus);
		expect(
			creances().ajouter(i.ctx(), {
				sens: 'dette',
				tiers: 'X',
				motif: 'Y',
				montant: centimes(1_00),
				date: '2026-10-31',
				actionId: null,
				note: null,
				pieces: [99]
			})
		).toEqual(refus);
		expect(compter('creance_dette')).toBe(1);
	});

	it('un·e lecteur·rice ne joint rien', () => {
		const id = dette();
		const p = deposer();
		const ctx = i.app.ctx({ ...i.tresorier, role: 'lecteur' });
		expect(pieces().rattacher(ctx, { pieceId: p.id, creanceId: id })).toEqual({
			ok: false,
			erreur: { code: 'acces_refuse' }
		});
		expect(pieces().dettesSansPiece(ctx).ok).toBe(false);
	});

	it('les Dettes ouvertes sans Pièce se proposent après une photo, et se comptent à la clôture', () => {
		const a = dette();
		dette({ tiers: 'Imprimerie fictive', pieces: [deposer(null, AUTRE).id] });
		const payee = dette({ tiers: 'Papeterie fictive', montant: centimes(20_00) });
		payer(payee, 20_00);
		dette({ sens: 'creance', tiers: 'Mairie fictive' });

		expect(valeur(pieces().dettesSansPiece(i.ctx())).map((d) => d.id)).toEqual([a]);
		expect(valeur(i.app.exercices.recapitulatifCloture(i.ctx(), i.courant.id)).dettes).toBe(1);
		deposer(a);
		expect(valeur(pieces().dettesSansPiece(i.ctx()))).toEqual([]);
		expect(valeur(i.app.exercices.recapitulatifCloture(i.ctx(), i.courant.id)).dettes).toBe(0);
	});
});
