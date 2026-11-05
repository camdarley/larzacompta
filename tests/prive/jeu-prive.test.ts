/**
 * SM-3 : charge le jeu privé de `.private/` et compare ses résultats attendus au centime.
 * `.private/jeu.ts` reste hors dépôt. Il exporte `charger(app, ctx)` et `attendus` (`JeuPrive`).
 * La base temporaire vit dans `.private/` et s'efface : aucune donnée n'en sort, et le test
 * n'affiche ni libellé ni montant, seulement le nom du chiffre qui diffère.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { soldeCompte } from '#lib/domaine/etats/soldes.ts';
import type { Centimes } from '#lib/domaine/montant.ts';
import type { Exercice } from '#lib/domaine/exercices.ts';
import type { Ctx } from '#lib/server/application/executer.ts';
import { composer, type Application } from '#lib/server/composition.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '#lib/server/infra/sqlite/connexion.ts';
import { appliquerMigrations, chargerMigrations } from '#lib/server/infra/sqlite/migrateur.ts';

export type AttendusPrives = {
	/** Libellé de l'Exercice regardé, par exemple `2025-2026`. */
	exercice: string;
	recettes: Centimes;
	depenses: Centimes;
	resultat: Centimes;
	/** Variation de trésorerie de l'Exercice. */
	variation: Centimes;
	/** Solde de fin par libellé de Compte. */
	soldes: Record<string, Centimes>;
};

export type JeuPrive = {
	charger(app: Application, ctx: Ctx): void | Promise<void>;
	attendus: AttendusPrives;
};

const actif = process.env.APE_JEU_PRIVE === '1';

function exiger<T>(r: { ok: true; valeur: T } | { ok: false; erreur: { code: string } }): T {
	if (!r.ok) throw new Error(r.erreur.code);
	return r.valeur;
}

describe.skipIf(!actif)('jeu privé', () => {
	it('tombe juste au centime', async () => {
		const jeu = (await import(/* @vite-ignore */ resolve('.private/jeu.ts'))) as JeuPrive;
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
			await jeu.charger(app, ctx);

			const { attendus } = jeu;
			const exercice = app.socle.depots.exercices
				.lister()
				.find((e) => e.libelle === attendus.exercice) as Exercice;
			expect(exercice, 'Exercice introuvable').toBeDefined();
			const { resultat } = exiger(app.etats.compteDeResultat(ctx, exercice));
			const { etat } = exiger(app.etats.tresorerie(ctx, exercice));
			const journal = exiger(app.operations.journal(ctx));
			const compteDe = (libelle: string) =>
				app.socle.depots.parametrage.comptes().find((c) => c.libelle === libelle)?.id ?? 0;
			const ecarts = [
				['recettes', resultat.recettes, attendus.recettes],
				['dépenses', resultat.depenses, attendus.depenses],
				['résultat', resultat.resultat, attendus.resultat],
				['variation', etat.variation, attendus.variation],
				...Object.entries(attendus.soldes).map(([compte, attendu], i) => [
					`solde du Compte n° ${i + 1}`,
					soldeCompte(journal, compteDe(compte), exercice.fin as string),
					attendu
				])
			]
				.filter(([, lu, attendu]) => lu !== attendu)
				.map(([nom]) => nom);
			// Seuls les noms des chiffres sortent : un écart de montant resterait une donnée réelle.
			expect(ecarts).toEqual([]);
			expect(exiger(app.etats.verifier(app.ctx(null))).map((v) => v.invariant)).toEqual([]);
		} finally {
			base.close();
			rmSync(dossier, { recursive: true, force: true });
		}
	});
});
