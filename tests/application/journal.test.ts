import { beforeEach, describe, expect, it } from 'vitest';
import { banc, type Banc } from './aides/app.ts';

let b: Banc;

function valeur<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

beforeEach(() => {
	b = banc();
	for (let i = 0; i < 60; i++) {
		b.horloge.instant = new Date(Date.UTC(2026, 9, 1 + (i % 30), 10, i)).toISOString();
		valeur(b.app.parametrage.creerGroupe(b.ctx(), `Groupe ${i}`));
	}
});

describe('Journal des modifications', () => {
	it('va du plus récent au plus ancien, par pages de 50', () => {
		const p1 = valeur(b.app.journal.lister(b.ctx(), {}, 1));
		expect(p1.entrees).toHaveLength(50);
		expect(p1.total).toBe(60);
		expect(p1.pages).toBe(2);
		const dates = p1.entrees.map((e) => e.horodatage);
		expect([...dates].sort().reverse()).toEqual(dates);
		const p2 = valeur(b.app.journal.lister(b.ctx(), {}, 2));
		expect(p2.entrees).toHaveLength(10);
		expect(p2.entrees[0]?.id).not.toBe(p1.entrees.at(-1)?.id);
	});

	it('combine personne, type et période', () => {
		const ctx = b.ctx();
		const parType = valeur(b.app.journal.lister(ctx, { type: 'groupe' }, 1));
		expect(parType.total).toBe(60);
		expect(valeur(b.app.journal.lister(ctx, { type: 'compte' }, 1)).total).toBe(0);
		expect(valeur(b.app.journal.lister(ctx, { personne: 'Personne absente' }, 1)).total).toBe(0);
		const periode = valeur(
			b.app.journal.lister(
				ctx,
				{ du: '2026-10-05', au: '2026-10-06', personne: 'Camille Fictive' },
				1
			)
		);
		expect(periode.total).toBe(4);
		expect(periode.personnes).toEqual(['Camille Fictive']);
		expect(periode.types).toEqual(['groupe']);
	});

	it('une page hors limites reste une page valide', () => {
		const p = valeur(b.app.journal.lister(b.ctx(), {}, 0));
		expect(p.page).toBe(1);
	});

	it('refuse sans droit de consultation', () => {
		const r = b.app.journal.lister(b.app.ctx({ ...b.tresorier, role: 'compteur' }), {}, 1);
		expect(!r.ok && r.erreur.code).toBe('acces_refuse');
		expect(b.app.journal.lister(b.app.ctx({ ...b.tresorier, role: 'lecteur' }), {}, 1).ok).toBe(
			true
		);
	});

	it('les triggers refusent toute modification', () => {
		expect(() => b.base.exec(`UPDATE journal_modification SET resume = 'x'`)).toThrow(
			'journal_immuable'
		);
		expect(() => b.base.exec('DELETE FROM journal_modification')).toThrow('journal_immuable');
	});
});
