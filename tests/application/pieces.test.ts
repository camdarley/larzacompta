import { beforeEach, describe, expect, it } from 'vitest';
import { composer } from '#lib/server/composition.ts';
import { baseAvecCloture } from './aides/base.ts';
import { instancePrete, valeur } from './aides/instance.ts';

const PDF = new TextEncoder().encode('%PDF-1.7\nfictif');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

let i: ReturnType<typeof instancePrete>;
const pieces = () => i.app.pieces;
const compterPieces = () => i.base.prepare('SELECT count(*) FROM piece').pluck().get() as number;

function nouvelleDepense(montant = 2000, libelle = 'Papeterie fictive') {
	return valeur(i.app.operations.creer(i.ctx(), i.saisie('depense', montant, { libelle }))).id;
}

const deposer = (operationId: number | null = null, octets = PDF, nomOriginal = 'facture.pdf') =>
	pieces().deposer(i.ctx(), { nomOriginal, octets, operationId });

const lecteur = () => ({ ...i.tresorier, role: 'lecteur' as const });
const compteur = () => ({ ...i.tresorier, role: 'compteur' as const });

beforeEach(() => {
	i = instancePrete();
});

describe('dépôt d’une Pièce', () => {
	it('vérifie le format sur les octets, écrit le fichier puis sa ligne', () => {
		const op = nouvelleDepense();
		const p = valeur(deposer(op));
		expect(p.mime).toBe('application/pdf');
		expect(i.fichiers.get(p.sha256)).toEqual(PDF);
		expect(valeur(i.app.operations.detail(i.ctx(), op)).pieces.map((x) => x.id)).toEqual([p.id]);
		expect(i.journal().map((e) => e.evenement)).toContain('piece.rattachee');
	});

	it('refuse un faux fichier sans rien écrire', () => {
		const r = deposer(null, new TextEncoder().encode('<html>'), 'faux.pdf');
		expect(r).toEqual({ ok: false, erreur: { code: 'piece_refusee' } });
		expect(i.fichiers.size).toBe(0);
		expect(compterPieces()).toBe(0);
	});

	it('ne garde qu’une Pièce pour deux dépôts du même fichier', () => {
		const a = nouvelleDepense();
		const b = nouvelleDepense();
		const c = nouvelleDepense();
		const premier = valeur(deposer(a));
		const second = valeur(deposer(b, PDF, 'copie.pdf'));
		valeur(deposer(c));
		expect(second.id).toBe(premier.id);
		expect(second.connue).toBe(true);
		expect(second.nomOriginal).toBe('facture.pdf');
		expect(compterPieces()).toBe(1);
		const [vue] = valeur(i.app.operations.detail(i.ctx(), a)).pieces;
		expect(vue?.operations.map((o) => o.id).sort()).toEqual([a, b, c].sort());
	});

	it('redéposer un fichier connu sans Opération n’écrit rien au Journal', () => {
		valeur(deposer());
		const avant = i.journal().length;
		expect(valeur(deposer()).connue).toBe(true);
		expect(i.journal()).toHaveLength(avant);
	});

	it('une Opération annulée ne reçoit plus de Pièce, et rien ne reste du dépôt', () => {
		const op = nouvelleDepense();
		valeur(i.app.operations.annuler(i.ctx(), op));
		expect(deposer(op)).toEqual({ ok: false, erreur: { code: 'operation_annulee' } });
		expect(compterPieces()).toBe(0);
	});

	it('refuse le dépôt à qui ne saisit pas, sans écrire de fichier', () => {
		const r = pieces().deposer(i.app.ctx(lecteur()), {
			nomOriginal: 'x.pdf',
			octets: PDF,
			operationId: null
		});
		expect(r).toEqual({ ok: false, erreur: { code: 'acces_refuse' } });
		expect(i.fichiers.size).toBe(0);
	});

	it('une Pièce attend sans Opération, puis se rattache et se retire', () => {
		const op = nouvelleDepense();
		const p = valeur(deposer());
		const attente = valeur(pieces().lister(i.ctx(), { etat: 'en_attente' }, 1));
		expect(attente.pieces.map((x) => x.id)).toEqual([p.id]);

		valeur(pieces().rattacher(i.ctx(), { pieceId: p.id, operationId: op }));
		// Deux fois le même geste ne note qu'une fois.
		const notes = i.journal().length;
		valeur(pieces().rattacher(i.ctx(), { pieceId: p.id, operationId: op }));
		expect(i.journal()).toHaveLength(notes);
		expect(valeur(pieces().lister(i.ctx(), { etat: 'en_attente' }, 1)).total).toBe(0);

		valeur(pieces().detacher(i.ctx(), { pieceId: p.id, operationId: op }));
		expect(valeur(i.app.operations.detail(i.ctx(), op)).pieces).toEqual([]);
		expect(i.journal().at(-1)?.evenement).toBe('piece.detachee');
		const fin = i.journal().length;
		valeur(pieces().detacher(i.ctx(), { pieceId: p.id, operationId: op }));
		expect(i.journal()).toHaveLength(fin);
	});

	it('refuse un rattachement vers ce qui n’existe pas', () => {
		const p = valeur(deposer());
		const refus = { ok: false, erreur: { code: 'element_introuvable' } };
		expect(pieces().rattacher(i.ctx(), { pieceId: p.id, operationId: 99 })).toEqual(refus);
		expect(pieces().rattacher(i.ctx(), { pieceId: 99, operationId: 1 })).toEqual(refus);
		expect(pieces().detacher(i.ctx(), { pieceId: 99, operationId: 1 })).toEqual(refus);
	});

	it('les Pièces d’une saisie se rattachent avec l’Opération, dans sa transaction', () => {
		const p = valeur(deposer());
		const id = valeur(
			i.app.operations.creer(i.ctx(), { ...i.saisie('depense', 500), pieces: [p.id] })
		).id;
		expect(valeur(i.app.operations.detail(i.ctx(), id)).pieces.map((x) => x.id)).toEqual([p.id]);

		const avant = i.base.prepare('SELECT count(*) FROM operation').pluck().get();
		const r = i.app.operations.creer(i.ctx(), { ...i.saisie('depense', 500), pieces: [99] });
		expect(r.ok).toBe(false);
		expect(i.base.prepare('SELECT count(*) FROM operation').pluck().get()).toBe(avant);
	});
});

describe('Exercice clôturé (AD-5)', () => {
	function cloture() {
		const base = baseAvecCloture();
		const fichiers = new Map<string, Uint8Array>();
		const app = composer({
			base,
			journaliseur: { info() {}, erreur() {} },
			fichiers: {
				ecrire(octets) {
					fichiers.set('sha', octets);
					return 'sha';
				},
				lire: (s) => fichiers.get(s) ?? null,
				existe: (s) => fichiers.has(s),
				lister: () => [],
				supprimer() {}
			}
		});
		const ctx = app.ctx({
			id: 1,
			identifiant: 'test',
			nomAffiche: 'Personne fictive',
			role: 'tresorier',
			preferences: { theme: 'systeme', raccourcis: true }
		});
		return { app, ctx, base };
	}

	it('un rattachement reste permis, et se retire', () => {
		const { app, ctx } = cloture();
		const p = valeur(
			app.pieces.deposer(ctx, { nomOriginal: 'car.pdf', octets: PDF, operationId: 1 })
		);
		expect(valeur(app.operations.detail(ctx, 1)).pieces).toHaveLength(1);
		valeur(app.pieces.detacher(ctx, { pieceId: p.id, operationId: 1 }));
		expect(valeur(app.operations.detail(ctx, 1)).pieces).toHaveLength(0);
	});

	it('« Pas besoin de Pièce » reste permis', () => {
		const { app, ctx, base } = cloture();
		valeur(app.operations.definirSansPiece(ctx, { id: 1, sansPiece: true }));
		expect(base.prepare('SELECT sans_piece FROM operation WHERE id = 1').pluck().get()).toBe(1);
	});
});

describe('F7 : le fichier d’une Pièce rattachée reste', () => {
	it('F7 : une Pièce rattachée ne se supprime pas', () => {
		const op = nouvelleDepense();
		const p = valeur(deposer(op));
		expect(pieces().supprimer(i.ctx(), p.id)).toEqual({
			ok: false,
			erreur: { code: 'piece_utilisee' }
		});
		expect(compterPieces()).toBe(1);
	});

	it('F7 : une Pièce d’une Opération annulée non plus', () => {
		const op = nouvelleDepense();
		const p = valeur(deposer(op));
		valeur(i.app.operations.annuler(i.ctx(), op));
		expect(pieces().supprimer(i.ctx(), p.id).ok).toBe(false);
	});

	it('F7 : une Pièce en attente part, sans toucher au fichier avant la sauvegarde', () => {
		const p = valeur(deposer());
		valeur(pieces().supprimer(i.ctx(), p.id));
		expect(compterPieces()).toBe(0);
		expect(i.fichiers.size).toBe(1);
		expect(i.journal().at(-1)?.evenement).toBe('piece.supprimee');
		expect(pieces().supprimer(i.ctx(), p.id).ok).toBe(false);
	});
});

describe('Pièces manquantes (F6)', () => {
	const ids = () => valeur(pieces().manquantes(i.ctx(), i.courant)).map((d) => d.id);

	it('F6 : liste les dépenses sans Pièce, et les compte', () => {
		const a = nouvelleDepense();
		valeur(i.app.operations.creer(i.ctx(), i.saisie('recette', 500)));
		expect(ids()).toEqual([a]);
		expect(valeur(pieces().compterManquantes(i.ctx(), i.courant))).toBe(1);
		const [d] = valeur(pieces().manquantes(i.ctx(), i.courant));
		expect(d).toMatchObject({
			montant: 2000,
			compte: 'CCP',
			natures: 'Papeterie',
			exercice: '2026-2027'
		});
	});

	it('F6 : « Pas besoin de Pièce » sort l’Opération de la liste', () => {
		const a = nouvelleDepense();
		valeur(i.app.operations.definirSansPiece(i.ctx(), { id: a, sansPiece: true }));
		expect(ids()).toEqual([]);
		expect(i.journal().at(-1)?.resume).toContain('pas besoin de Pièce');
		valeur(i.app.operations.definirSansPiece(i.ctx(), { id: a, sansPiece: false }));
		expect(ids()).toEqual([a]);
		expect(i.journal().at(-1)?.resume).toContain('de nouveau demandé');
	});

	it('F6 : la case cochée à la saisie évite la liste', () => {
		valeur(i.app.operations.creer(i.ctx(), { ...i.saisie('depense', 300), sansPiece: true }));
		expect(ids()).toEqual([]);
	});

	it('F6 : corriger une Opération garde sa dispense', () => {
		const a = valeur(
			i.app.operations.creer(i.ctx(), { ...i.saisie('depense', 300), sansPiece: true })
		).id;
		const version = valeur(i.app.operations.detail(i.ctx(), a)).operation.version;
		valeur(
			i.app.operations.modifier(i.ctx(), {
				id: a,
				version,
				saisie: i.saisie('depense', 300, { libelle: 'Corrigée' })
			})
		);
		expect(ids()).toEqual([]);
	});

	it('la dispense ne change pas la version : une saisie ouverte reste valable', () => {
		const a = nouvelleDepense();
		const avant = valeur(i.app.operations.detail(i.ctx(), a)).operation.version;
		valeur(i.app.operations.definirSansPiece(i.ctx(), { id: a, sansPiece: true }));
		expect(valeur(i.app.operations.detail(i.ctx(), a)).operation.version).toBe(avant);
	});

	it('refuse la dispense sur une Opération annulée ou inconnue', () => {
		const a = nouvelleDepense();
		valeur(i.app.operations.annuler(i.ctx(), a));
		expect(i.app.operations.definirSansPiece(i.ctx(), { id: a, sansPiece: true })).toEqual({
			ok: false,
			erreur: { code: 'operation_annulee' }
		});
		expect(i.app.operations.definirSansPiece(i.ctx(), { id: 99, sansPiece: true }).ok).toBe(false);
	});

	it('dit au panneau si l’Opération porte une dépense', () => {
		const a = nouvelleDepense();
		const r = valeur(i.app.operations.creer(i.ctx(), i.saisie('recette', 500))).id;
		expect(valeur(i.app.operations.detail(i.ctx(), a)).estDepense).toBe(true);
		expect(valeur(i.app.operations.detail(i.ctx(), r)).estDepense).toBe(false);
	});

	it('propose d’abord les dépenses les plus récentes pour une photo', () => {
		valeur(
			i.app.operations.creer(
				i.ctx(),
				i.saisie('depense', 100, { date: '2026-09-02', libelle: 'Vieille' })
			)
		);
		const recente = nouvelleDepense();
		expect(valeur(pieces().depensesRecentes(i.ctx())).map((d) => d.id)[0]).toBe(recente);
	});
});

describe('lecture et droits', () => {
	it('sert le fichier à qui consulte, jamais à un·e compteur·se', () => {
		const p = valeur(deposer());
		const lu = valeur(pieces().fichier(i.app.ctx(lecteur()), p.sha256));
		expect(lu).toMatchObject({ mime: 'application/pdf', nom: 'facture.pdf' });
		expect(lu.octets).toEqual(PDF);
		expect(pieces().fichier(i.app.ctx(compteur()), p.sha256)).toEqual({
			ok: false,
			erreur: { code: 'acces_refuse' }
		});
		expect(pieces().fichier(i.app.ctx(null), p.sha256).ok).toBe(false);
	});

	it('ne sert pas un fichier qui n’est pas une Pièce, ni un fichier disparu', () => {
		const sha = i.app.socle.fichiers.ecrire(new TextEncoder().encode('relevé'));
		expect(pieces().fichier(i.ctx(), sha).ok).toBe(false);
		const p = valeur(deposer(null, PNG, 'a.png'));
		i.fichiers.delete(p.sha256);
		expect(pieces().fichier(i.ctx(), p.sha256).ok).toBe(false);
	});

	it('un·e lecteur·rice consulte sans rien changer', () => {
		const op = nouvelleDepense();
		const p = valeur(deposer(op));
		const ctx = i.app.ctx(lecteur());
		expect(valeur(pieces().parId(ctx, p.id)).id).toBe(p.id);
		expect(valeur(pieces().manquantes(ctx, null))).toEqual([]);
		const refus = { ok: false, erreur: { code: 'acces_refuse' } };
		expect(pieces().rattacher(ctx, { pieceId: p.id, operationId: op })).toEqual(refus);
		expect(pieces().detacher(ctx, { pieceId: p.id, operationId: op })).toEqual(refus);
		expect(pieces().supprimer(ctx, p.id)).toEqual(refus);
		expect(pieces().depensesRecentes(ctx)).toEqual(refus);
		expect(i.app.operations.definirSansPiece(ctx, { id: op, sansPiece: true })).toEqual(refus);
	});

	it('pagine et filtre l’onglet Toutes', () => {
		valeur(deposer(null, PDF, 'facture.pdf'));
		valeur(deposer(null, PNG, 'ticket.png'));
		const toutes = valeur(pieces().lister(i.ctx(), { type: 'image' }, 9));
		expect(toutes).toMatchObject({ total: 1, existantes: 2, page: 1, pages: 1 });
		expect(pieces().parId(i.ctx(), 99).ok).toBe(false);
	});
});

describe('recherche', () => {
	it('le filtre « présence de Pièce » suit les Pièces réelles', () => {
		const avec = nouvelleDepense(100, 'Avec');
		const sans = nouvelleDepense(200, 'Sans');
		valeur(deposer(avec));
		const trouve = (piece: 'avec' | 'sans') =>
			valeur(i.app.operations.rechercher(i.ctx(), { piece }, 1)).rangees.map((r) => r.id);
		expect(trouve('avec')).toEqual([avec]);
		expect(trouve('sans')).toEqual([sans]);
	});
});
