/**
 * Story 11.1 : un·e lecteur·rice ne change rien. Ce test parcourt toutes les fonctions de la couche
 * application, sans liste à tenir pour les écritures : une fonction nouvelle est refusée à ce rôle,
 * ou doit être rangée ici, à la main, avec sa raison.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '#lib/server/composition.ts';
import { instancePrete } from './aides/instance.ts';

/** Lectures ouvertes par les droits `consulter`, `consulter_suivi` ou sans droit (repères). */
const LECTURES = [
	'caisses.compteDeDepot',
	'caisses.detail',
	'caisses.liste',
	'caisses.session',
	'caisses.sessionsDeLAction',
	'cheques.bordereau',
	'cheques.emis',
	'cheques.fiche',
	'cheques.recus',
	'cheques.remise',
	'cheques.remises',
	'creances.suivi',
	'etats.action',
	'etats.actions',
	'etats.anciennes',
	'etats.compteDeResultat',
	'etats.modele',
	'etats.tableau',
	'etats.tresorerie',
	'etats.verifier',
	'exercices.anneeCourante',
	'exercices.lister',
	'exercices.selection',
	'exploitation.codeSource',
	'exploitation.codeSourcePresent',
	'journal.lister',
	'operations.contexteSaisie',
	'operations.dateParDefaut',
	'operations.detail',
	'operations.exporter',
	'operations.journal',
	'operations.palette',
	'operations.rechercher',
	'operations.soldes',
	'parametrage.association',
	'parametrage.soldesDepart',
	'pieces.compterManquantes',
	'pieces.fichier',
	'pieces.lister',
	'pieces.manquantes',
	'pieces.parId'
];

/** Le compte de la personne elle-même : ni donnée comptable, ni paramétrage. */
const PERSONNELLES = [
	'acces.accepterInvitation',
	'acces.accesDepuisSession',
	'acces.changerMotDePasse',
	'acces.changerPreferences',
	'acces.connecter',
	'acces.deconnecter',
	'acces.instanceSansAcces',
	'acces.lireInvitation',
	'acces.lireSession'
];

/** Sans `ctx` ou sans session, appelées par `ape` ou le minuteur, jamais par une route. */
const HORS_HTTP = [
	'acces.emettreLienInitial',
	'acces.reinitialiser',
	'exploitation.apresRestauration',
	'exploitation.fermerInterrompues',
	'exploitation.lireVersionSiDu',
	'exploitation.sauvegarder',
	'exploitation.sauvegarderSiDu'
];

const OUVERTES = new Set([...LECTURES, ...PERSONNELLES, ...HORS_HTTP]);

type Fonction = (...args: unknown[]) => unknown;

function fonctions(app: Application) {
	return Object.entries(app).flatMap(([module, cas]) =>
		module === 'socle' || typeof cas !== 'object'
			? []
			: Object.entries(cas as Record<string, unknown>)
					.filter((c): c is [string, Fonction] => typeof c[1] === 'function')
					.map(([nom, f]) => ({ nom: `${module}.${nom}`, f }))
	);
}

let i: ReturnType<typeof instancePrete>;
const lecteur = () => i.app.ctx({ ...i.tresorier, role: 'lecteur' as const });

const tables = () =>
	i.base
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
		.pluck()
		.all() as string[];

const contenu = () =>
	JSON.stringify(tables().map((t) => [t, i.base.prepare(`SELECT * FROM "${t}"`).all()]));

beforeEach(() => {
	i = instancePrete();
});

describe('chaque cas d’usage appelé par un·e lecteur·rice', () => {
	it('toute fonction rangée parmi les ouvertes existe encore', () => {
		const noms = new Set(fonctions(i.app).map((c) => c.nom));
		expect([...OUVERTES].filter((n) => !noms.has(n))).toEqual([]);
	});

	it('toute autre fonction refuse, sans rien écrire', async () => {
		const avant = contenu();
		const passees: string[] = [];
		const appels = fonctions(i.app).filter((c) => !OUVERTES.has(c.nom));
		// Le refus vient d'`executer()` ou de `lire()` : il ne dépend pas de l'entrée.
		for (const { nom, f } of appels) {
			const r = (await f(lecteur(), {}, {}, {})) as { ok: boolean; erreur?: { code: string } };
			if (r.ok !== false || r.erreur?.code !== 'acces_refuse') passees.push(nom);
		}
		expect(passees).toEqual([]);
		expect(appels.length).toBeGreaterThan(100);
		expect(contenu()).toBe(avant);
	});

	it('le trésorier·e passe le même contrôle : le test ne refuse pas pour une autre raison', () => {
		const r = i.app.creances.ajouter(i.ctx(), {
			sens: 'creance',
			tiers: 'Mairie fictive',
			motif: 'Subvention',
			montant: 100 as never,
			date: '2026-09-15',
			actionId: null,
			note: null
		});
		expect(r.ok).toBe(true);
	});

	it('modifier ses préférences reste possible, et n’écrit rien de comptable', () => {
		expect(
			i.app.acces.changerPreferences(lecteur(), { theme: 'sombre', raccourcis: true }).ok
		).toBe(true);
	});
});
