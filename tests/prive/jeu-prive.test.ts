/**
 * SM-3 : charge le jeu privé de `.private/` et le confronte aux chiffres du classeur, au centime.
 * `.private/jeu.ts` reste hors dépôt. Il exporte `charger(app, ctx, causes)` et `attendus`.
 *
 * Trois preuves, chacune sur une base neuve :
 * 1. sans aucune cause, le cahier est celui présenté en AG : recettes, dépenses, résultat, résultat
 *    par Action, et l'écart entre soldes constatés et calculés est celui du classeur ;
 * 2. chaque cause, seule, déplace son Compte et le résultat de son montant, et rien d'autre ;
 * 3. toutes les causes ensemble ramènent chaque Compte à son solde constaté : il ne reste rien.
 *
 * La base vit dans `.private/` et s'efface. Le test n'affiche ni libellé ni montant, seulement le
 * nom du chiffre qui diffère : un écart de montant resterait une donnée réelle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import { centimes, sommeCentimes, type Centimes } from '#lib/domaine/montant.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { Ctx } from '#lib/server/application/executer.ts';
import { composer, type Application } from '#lib/server/composition.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { appliquerMigrations, chargerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';

/** Une raison nommée de l'écart : son Compte, son montant, et son effet sur le résultat. */
export type CausePrivee = { id: string; compte: string; montant: Centimes };

export type AttendusPrives = {
	/** Libellé de l'Exercice regardé, par exemple `2025-2026`. */
	exercice: string;
	/** Tels que présentés en AG. */
	recettes: Centimes;
	depenses: Centimes;
	resultat: Centimes;
	/** Résultat présenté par libellé d'Action. */
	actions: Record<string, Centimes>;
	/** Variation réelle de trésorerie de l'Exercice, soldes constatés contre soldes de départ. */
	variation: Centimes;
	/** Solde constaté en fin d'Exercice, par libellé de Compte. */
	constates: Record<string, Centimes>;
	/** Écart non expliqué du classeur : constaté moins calculé, tous Comptes réunis. */
	ecart: Centimes;
	causes: CausePrivee[];
};

export type JeuPrive = {
	/** `causes` : les causes de l'écart à inscrire dans le cahier. Vide : le cahier présenté. */
	charger(app: Application, ctx: Ctx, causes: ReadonlySet<string>): void | Promise<void>;
	attendus: AttendusPrives;
};

const actif = process.env.APE_JEU_PRIVE === '1';

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

type Lecture = {
	recettes: Centimes;
	depenses: Centimes;
	resultat: Centimes;
	variation: Centimes;
	actions: Record<string, Centimes>;
	soldes: Record<string, Centimes>;
	violations: string[];
	anomalies: number;
};

/** Charge le jeu avec ces causes sur une base neuve, et relit ce que disent les états. */
async function lire(jeu: JeuPrive, causes: readonly string[]): Promise<Lecture> {
	const dossier = mkdtempSync(resolve('.private/tmp-'));
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	try {
		const maintenant = new Date().toISOString();
		appliquerMigrations(base, chargerMigrations('migrations'), { horodatage: maintenant });
		const app = composer({
			base,
			fichiers: creerFichiers(join(dossier, 'fichiers')),
			journaliseur: { info() {}, erreur() {} }
		});
		const id = app.socle.depots.acces.creer({
			identifiant: 'prive',
			nomAffiche: 'Contrôle privé',
			role: 'tresorier',
			hash: 'sans-objet',
			creeLe: maintenant
		});
		const ctx = app.ctx({
			id,
			identifiant: 'prive',
			nomAffiche: 'Contrôle privé',
			role: 'tresorier',
			preferences: { theme: 'systeme', raccourcis: true }
		});
		await jeu.charger(app, ctx, new Set(causes));

		const exercice = app.socle.depots.exercices
			.lister()
			.find((e) => e.libelle === jeu.attendus.exercice) as Exercice;
		expect(exercice, 'Exercice introuvable').toBeDefined();
		const { resultat, anomalies } = exiger(app.etats.compteDeResultat(ctx, exercice));
		const { etat } = exiger(app.etats.tresorerie(ctx, exercice));
		const parAction = exiger(app.etats.actions(ctx, exercice)).resultat;
		const journal = exiger(app.operations.journal(ctx));
		const actions = parAction.groupes
			.flatMap((g) => g.actions)
			.map((a) => [a.libelle, a.resultat] as const);
		const soldes = app.socle.depots.parametrage
			.comptes()
			.filter((c) => c.libelle in jeu.attendus.constates)
			.map((c) => [c.libelle, soldeCompte(journal, c.id, exercice.fin as string)] as const);
		return {
			recettes: resultat.recettes,
			depenses: resultat.depenses,
			resultat: resultat.resultat,
			variation: etat.variation,
			actions: Object.fromEntries(actions),
			soldes: Object.fromEntries(soldes),
			violations: exiger(app.etats.verifier(app.ctx(null))).map((v) => v.invariant),
			anomalies: anomalies.length
		};
	} finally {
		base.close();
		rmSync(dossier, { recursive: true, force: true });
	}
}

/** Noms des chiffres qui diffèrent : c'est tout ce qui sort, jamais leur valeur. */
function differences(lus: Record<string, number>, attendus: Record<string, number>) {
	return Object.keys({ ...lus, ...attendus }).filter((k) => lus[k] !== attendus[k]);
}

const decaler = (montant: Centimes, de: Centimes) => centimes(montant + de);

describe.skipIf(!actif)('jeu privé', () => {
	const charger = async () =>
		(await import(/* @vite-ignore */ resolve('.private/jeu.ts'))) as JeuPrive;

	it('retrouve au centime le résultat présenté en AG', async () => {
		const jeu = await charger();
		const { attendus } = jeu;
		const lu = await lire(jeu, []);
		const { recettes, depenses, resultat } = attendus;
		const totaux = { recettes: lu.recettes, depenses: lu.depenses, resultat: lu.resultat };
		expect(differences(totaux, { recettes, depenses, resultat })).toEqual([]);
		const presentees = Object.keys(attendus.actions);
		const lues = Object.fromEntries(presentees.map((a) => [a, lu.actions[a] as number]));
		expect(differences(lues, attendus.actions)).toEqual([]);
		expect(lu.violations).toEqual([]);
		expect(lu.anomalies).toBe(0);
	});

	it('montre l’écart non expliqué du classeur, Compte par Compte', async () => {
		const jeu = await charger();
		const { attendus } = jeu;
		const lu = await lire(jeu, []);
		const ecarts = Object.entries(attendus.constates).map(([compte, constate]) =>
			centimes(constate - (lu.soldes[compte] as number))
		);
		expect(sommeCentimes(ecarts) === attendus.ecart, 'écart total').toBe(true);
		expect(lu.variation === decaler(attendus.variation, centimes(-attendus.ecart))).toBe(true);
	});

	it('le décompose en causes nommées, chacune à sa place', async () => {
		const jeu = await charger();
		const { attendus } = jeu;
		expect(attendus.causes.length).toBeGreaterThan(0);
		expect(sommeCentimes(attendus.causes.map((c) => c.montant)) === attendus.ecart).toBe(true);
		const base = await lire(jeu, []);
		for (const cause of attendus.causes) {
			const lu = await lire(jeu, [cause.id]);
			const soldes = { ...base.soldes };
			soldes[cause.compte] = decaler(soldes[cause.compte] as Centimes, cause.montant);
			expect(differences(lu.soldes, soldes), cause.id).toEqual([]);
			expect(lu.resultat === decaler(base.resultat, cause.montant), cause.id).toBe(true);
			expect(lu.violations, cause.id).toEqual([]);
		}
	});

	it('ne laisse rien une fois toutes les causes inscrites', async () => {
		const jeu = await charger();
		const { attendus } = jeu;
		const lu = await lire(
			jeu,
			attendus.causes.map((c) => c.id)
		);
		expect(differences(lu.soldes, attendus.constates)).toEqual([]);
		expect(lu.variation === attendus.variation, 'variation').toBe(true);
		expect(lu.resultat === decaler(attendus.resultat, attendus.ecart), 'résultat').toBe(true);
		expect(lu.violations).toEqual([]);
		expect(lu.anomalies).toBe(0);
	});
});
