import { beforeEach, describe, expect, it } from 'vitest';
import { echec, succes } from '#lib/domaine/resultat.ts';
import type { CasUsage } from '#lib/server/application/executer.ts';
import { banc, type Banc } from './aides/app.ts';

let b: Banc;

beforeEach(() => {
	b = banc();
});

const compter = (table: string) =>
	b.base.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;

const creerGroupe = (table = 'groupe') =>
	b.base.prepare(`INSERT INTO ${table} (libelle, ordre) VALUES ('Fonctionnement', 1)`);

const casEcriture: CasUsage<string, number> = {
	droit: 'parametrer',
	faire(o, e) {
		creerGroupe().run();
		o.noter({
			evenement: 'groupe.cree',
			entiteType: 'groupe',
			resume: `a créé le Groupe ${e}.`
		});
		return succes(1);
	}
};

describe('executer', () => {
	it('valide ensemble écriture et Journal', () => {
		const r = b.app.executer(casEcriture, b.ctx(), 'Fonctionnement');
		expect(r).toEqual({ ok: true, valeur: 1 });
		expect(compter('groupe')).toBe(1);
		expect(b.journal().at(-1)).toEqual({
			evenement: 'groupe.cree',
			resume: 'a créé le Groupe Fonctionnement.',
			acces_nom: 'Camille Fictive'
		});
	});

	it('refuse sans le droit, avant toute écriture', () => {
		const lecteur = { ...b.tresorier, role: 'lecteur' as const };
		const r = b.app.executer(casEcriture, b.app.ctx(lecteur), 'x');
		expect(r).toEqual({ ok: false, erreur: { code: 'acces_refuse' } });
		expect(compter('groupe')).toBe(0);
	});

	it('refuse sans session', () => {
		expect(b.app.executer(casEcriture, b.app.ctx(null), 'x').ok).toBe(false);
	});

	it("n'écrit rien si la décision échoue après coup", () => {
		const cas: CasUsage<void, never> = {
			droit: 'parametrer',
			faire(o) {
				creerGroupe().run();
				o.noter({ evenement: 'groupe.cree', entiteType: 'groupe', resume: 'a créé.' });
				return echec('deja_utilise');
			}
		};
		expect(b.app.executer(cas, b.ctx(), undefined).ok).toBe(false);
		expect(compter('groupe')).toBe(0);
		expect(compter('journal_modification')).toBe(0);
	});

	it("n'écrit rien si une écriture lève après l'entrée de Journal", () => {
		const cas: CasUsage<void, number> = {
			droit: 'parametrer',
			faire(o) {
				creerGroupe().run();
				o.noter({ evenement: 'groupe.cree', entiteType: 'groupe', resume: 'a créé.' });
				throw new Error('panne simulée');
			}
		};
		expect(() => b.app.executer(cas, b.ctx(), undefined)).toThrow('panne simulée');
		expect(compter('groupe')).toBe(0);
		expect(compter('journal_modification')).toBe(0);
	});

	it('traduit un trigger en erreur métier', () => {
		const cas: CasUsage<void, number> = {
			droit: 'parametrer',
			sansJournal: true,
			faire() {
				b.base.exec(
					`INSERT INTO journal_modification (id, horodatage, acces_nom, evenement, entite_type, resume)
					 VALUES (1, 'x', 'P', 'a.b', 'a', 'r');
					 DELETE FROM journal_modification WHERE id = 1`
				);
				return succes(1);
			}
		};
		expect(b.app.executer(cas, b.ctx(), undefined)).toEqual({
			ok: false,
			erreur: { code: 'journal_immuable' }
		});
	});

	it('refuse une écriture sans trace', () => {
		const cas: CasUsage<void, number> = { droit: 'parametrer', faire: () => succes(1) };
		expect(() => b.app.executer(cas, b.ctx(), undefined)).toThrow(/Journal/);
	});

	it('date le contexte par le port Horloge', () => {
		b.horloge.instant = '2026-08-31T22:30:00.000Z';
		expect(b.ctx().maintenant).toBe('2026-08-31T22:30:00.000Z');
		expect(b.ctx().aujourdhui).toBe('2026-09-01');
	});

	it('toute lecture déclare son droit', () => {
		expect(b.app.lire(b.ctx(), 'consulter', () => 1)).toEqual({ ok: true, valeur: 1 });
		expect(b.app.lire(b.app.ctx(null), 'consulter', () => 1).ok).toBe(false);
	});
});
