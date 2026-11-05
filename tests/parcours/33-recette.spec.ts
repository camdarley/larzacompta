/**
 * Story 11.2 : les parcours de contrôle et de transmission de bout en bout, puis axe sur tous les
 * écrans des trois jalons, à 1280 et à 320 px, en clair et en sombre.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import {
	JETON_LECTEUR,
	JETON_TRESORIER,
	preparerInstanceEtats,
	type JeuEtats
} from './aides-etats.ts';
import { demarrerServeur } from './aides-instance.ts';
import { panneau } from './aides-operations.ts';
import { ecransV1, JETONS_V1, preparerInstanceV1, type InstanceV1 } from './aides-v1.ts';

const PORT_ETATS = 4194;
const PORT_V1 = 4195;
const ETATS = `http://localhost:${PORT_ETATS}`;
const V1 = `http://localhost:${PORT_V1}`;
const entetes = { 'x-forwarded-proto': 'http' };

test.use({ extraHTTPHeaders: entetes });
test.describe.configure({ timeout: 60_000 });

let dossierEtats: string;
let dossierV1: string;
let serveurs: ChildProcess[] = [];
let jeu: JeuEtats;
let v: InstanceV1;

test.beforeAll(async () => {
	dossierEtats = mkdtempSync(join(tmpdir(), 'ape-recette-etats-'));
	dossierV1 = mkdtempSync(join(tmpdir(), 'ape-recette-v1-'));
	jeu = preparerInstanceEtats(dossierEtats);
	v = await preparerInstanceV1(dossierV1);
	serveurs = [
		await demarrerServeur(dossierEtats, PORT_ETATS),
		await demarrerServeur(dossierV1, PORT_V1)
	];
});

test.afterAll(() => {
	for (const s of serveurs) s.kill();
	rmSync(dossierEtats, { recursive: true, force: true });
	rmSync(dossierV1, { recursive: true, force: true });
});

test('UJ-3 : Dominique remonte de la Kermesse à la Pièce et à la banque, Camille clôture', async ({
	page,
	context
}) => {
	test.setTimeout(90_000);
	await context.addCookies([{ name: 'ape_session', value: JETON_LECTEUR, url: ETATS }]);
	const debut = Date.now();

	await page.goto(`${ETATS}/`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.getByRole('link', { name: 'Actions', exact: true }).first().click();
	await page.waitForLoadState('networkidle');
	const grille = page.getByRole('treegrid').first();
	for (const nom of [/Évènements/, /Kermesse/, /Transport/]) {
		await grille.getByRole('row', { name: nom }).first().click();
	}
	await grille
		.getByRole('row', { name: /Autocars du Vallon/ })
		.getByRole('link', { name: /Ouvrir la Pièce/ })
		.click();
	await expect(page.getByRole('dialog')).toContainText('facture-autocars-fictive.pdf');
	await expect(page.getByRole('dialog').getByRole('link', { name: 'Télécharger' })).toBeVisible();
	await page.keyboard.press('Escape');

	await grille.getByRole('row', { name: /Autocars du Vallon/ }).click();
	const detail = page.getByRole('dialog');
	await expect(detail.getByRole('heading', { name: 'Mouvement bancaire' })).toBeVisible();
	await expect(detail).toContainText('AUTOCARS DU VALLON');
	await expect(detail.getByRole('button', { name: /Enregistrer/ })).toHaveCount(0);

	// SM-5 : une personne extérieure retrouve la Pièce en moins d'une minute.
	expect(Date.now() - debut).toBeLessThan(60_000);
	await page.keyboard.press('Escape');
	await expect(detail).toBeHidden();

	await context.clearCookies();
	await context.addCookies([{ name: 'ape_session', value: JETON_TRESORIER, url: ETATS }]);
	const b = new Database(join(dossierEtats, 'base.sqlite'), { readonly: true });
	const id = b.prepare('SELECT id FROM exercice WHERE libelle = ?').pluck().get(jeu.ecoule);
	b.close();
	await page.goto(`${ETATS}/reglages/exercices/${id}/cloture`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: `Clôturer ${jeu.ecoule}` }).click();
	await page
		.getByRole('alertdialog')
		.or(page.getByRole('dialog'))
		.getByRole('button', { name: `Clôturer ${jeu.ecoule}` })
		.click();
	await expect(page.getByRole('heading', { name: `${jeu.ecoule} est clôturé.` })).toBeVisible();
	await page.getByRole('link', { name: 'Voir le Document d’AG' }).click();
	await expect(page).toHaveURL(new RegExp(`document-ag\\?exercice=${jeu.ecoule}`));
	await expect(page.getByText('Exercice clôturé, lecture seule')).toBeVisible();
	const [telechargement] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('link', { name: 'Télécharger' }).click()
	]);
	expect(telechargement.suggestedFilename()).toBe(`document-ag-${jeu.ecoule}.pdf`);
});

test('UJ-4 : un Accès créé, un mot de passe choisi, une Opération ventilée avec suggestion', async ({
	page,
	context,
	browser
}) => {
	await context.addCookies([{ name: 'ape_session', value: JETONS_V1.tresorier, url: V1 }]);
	await page.goto(`${V1}/reglages/acces?acces=nouveau`, { waitUntil: 'networkidle' });
	await page.getByLabel('Identifiant').fill('alex');
	await page.getByLabel('Nom affiché').fill('Alex Fictif');
	await page.getByLabel('Rôle').selectOption({ label: 'Trésorerie' });
	await page.getByRole('button', { name: 'Créer l’Accès' }).click();
	const lien = (await page.locator('code').textContent()) as string;

	const contexte = await browser.newContext({ baseURL: V1, extraHTTPHeaders: entetes });
	const alex = await contexte.newPage();
	await alex.goto(lien);
	await alex.getByLabel('Mot de passe').fill('le cahier passe de main');
	await alex.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(alex).toHaveURL(/\/$/);

	await alex.getByRole('link', { name: 'Nouvelle Opération' }).first().click();
	const d = panneau(alex);
	await d.getByLabel('Montant', { exact: true }).fill('30,00');
	await d.getByLabel('Date').fill('2026-11-04');
	await d.getByLabel('Libellé').pressSequentially('papeterie du');
	await expect(d.getByText('Suggestion', { exact: true })).toBeVisible();
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await expect(nature).toHaveValue('Fournitures');
	await nature.focus();
	await nature.press('Tab');
	await d.getByLabel('Montant de la ligne 1').fill('20,00');
	await d.getByRole('button', { name: /Ajouter une Ligne de 10,00/ }).click();
	const seconde = d.getByRole('combobox', { name: 'Nature de la ligne 2' });
	await seconde.fill('Buvette');
	await seconde.press('Enter');
	await expect(d.getByTestId('reste')).toContainText('Tout est réparti');
	await d.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(alex.getByRole('dialog')).toHaveCount(0);

	await alex.goto('/operations?q=papeterie du', { waitUntil: 'networkidle' });
	await expect(alex.getByRole('main')).toContainText('30,00');
	await alex.getByRole('link', { name: 'Journal' }).first().click();
	await expect(alex.getByRole('main')).toContainText('Alex Fictif');
	await contexte.close();
});

/** Toutes les pages du code, sans liste à tenir : un écran ajouté doit entrer dans `ecransV1`. */
function pages(dossier: string): string[] {
	return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? pages(join(dossier, e.name))
			: e.name === '+page.svelte'
				? [relative('src/routes', dossier)]
				: []
	);
}

test('la liste couvre chaque page des trois jalons', () => {
	const urls = ecransV1(v).map((e) => e.url.split(/[?#]/)[0] as string);
	const manquantes = pages('src/routes')
		.filter((p) => !p.startsWith('(public)'))
		.map((p) => {
			const motif = `/${p}`.replace(/\/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '[^/]+');
			return { p, motif: new RegExp(`^${motif === '' ? '/' : motif}$`) };
		})
		.filter(({ motif }) => !urls.some((u) => motif.test(u)))
		.map(({ p }) => p);
	expect(manquantes).toEqual([]);
});

test.describe('axe, tous les écrans des trois jalons', () => {
	for (const [nomFormat, viewport] of [
		['1280', { width: 1280, height: 800 }],
		['320', { width: 320, height: 640 }]
	] as const) {
		for (const colorScheme of ['light', 'dark'] as const) {
			test(`${nomFormat} px, ${colorScheme}`, async ({ browser }) => {
				test.setTimeout(300_000);
				const contexte = await browser.newContext({
					viewport,
					colorScheme,
					reducedMotion: 'reduce',
					locale: 'fr-FR',
					timezoneId: 'Europe/Paris',
					baseURL: V1,
					extraHTTPHeaders: entetes
				});
				const page = await contexte.newPage();
				let role: string | null = null;
				const violations: string[] = [];
				for (const e of ecransV1(v)) {
					if (e.role !== role) {
						await contexte.clearCookies();
						await contexte.addCookies([{ name: 'ape_session', value: JETONS_V1[e.role], url: V1 }]);
						role = e.role;
					}
					await page.goto(e.url, { waitUntil: 'networkidle' });
					try {
						await axeSansViolation(page);
					} catch (erreur) {
						violations.push(`${e.nom} : ${String(erreur).slice(0, 600)}`);
					}
					if (!(await sansDefilementHorizontal(page))) violations.push(`${e.nom} : défile`);
				}
				await contexte.clearCookies();
				for (const url of ['/connexion', '/invitation/lien-fictif-perime']) {
					await page.goto(url, { waitUntil: 'networkidle' });
					await axeSansViolation(page);
				}
				expect(violations).toEqual([]);
				await contexte.close();
			});
		}
	}
});
