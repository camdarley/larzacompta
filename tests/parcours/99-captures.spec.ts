/**
 * Captures d'écran pour relecture à l'œil, sautées par défaut.
 * `CAPTURES=/chemin/dossier pnpm exec playwright test 99-captures` : ordinateur et téléphone, clair et sombre.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { connecter } from './aides.ts';

const dossier = process.env.CAPTURES;

const FORMATS = [
	{ nom: 'ordinateur', largeur: 1280, hauteur: 800 },
	{ nom: 'tablette', largeur: 820, hauteur: 900 },
	{ nom: 'telephone', largeur: 390, hauteur: 780 }
];
const THEMES = ['clair', 'sombre'];

const ECRANS: [string, string][] = [
	['tableau', '/'],
	['aide', '/aide'],
	['journal', '/journal'],
	['journal-filtre', '/journal?type=compte'],
	['plus', '/plus'],
	['preferences', '/preferences'],
	['reglages', '/reglages'],
	['comptes', '/reglages/comptes'],
	['compte-nouveau', '/reglages/comptes?compte=nouveau'],
	['natures', '/reglages/natures'],
	['actions', '/reglages/actions'],
	['groupes', '/reglages/groupes'],
	['acces', '/reglages/acces'],
	['acces-nouveau', '/reglages/acces?acces=nouveau'],
	['exercices', '/reglages/exercices'],
	['nature-systeme', '/reglages/natures?nature=1'],
	['refus', '/page-inconnue'],
	['bienvenue-1', '/bienvenue?etape=1'],
	['bienvenue-2', '/bienvenue?etape=2'],
	['bienvenue-3', '/bienvenue?etape=3'],
	['bienvenue-fin', '/bienvenue?etape=fin']
];

async function photographier(page: Page, nom: string) {
	if (!dossier) return;
	await page.waitForLoadState('networkidle');
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(250);
	await page.screenshot({ path: join(dossier, `${nom}.png`) });
}

test.describe('captures', () => {
	test.skip(!dossier, 'CAPTURES non défini');
	test.setTimeout(240_000);

	test('écrans', async ({ page, context, browser }) => {
		mkdirSync(dossier as string, { recursive: true });
		await connecter(page);
		const cookies = await context.cookies();
		for (const format of FORMATS) {
			for (const theme of THEMES) {
				await context.addCookies([
					{ ...cookies[0], name: 'ape_theme', value: theme, httpOnly: false }
				] as never);
				await page.setViewportSize({ width: format.largeur, height: format.hauteur });
				for (const [nom, chemin] of ECRANS) {
					await page.goto(chemin);
					await photographier(page, `${nom}-${format.nom}-${theme}`);
				}
			}
		}
		const invite = await browser.newContext({
			baseURL: test.info().project.use.baseURL,
			extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
		});
		const anonyme = await invite.newPage();
		for (const format of FORMATS) {
			await anonyme.setViewportSize({ width: format.largeur, height: format.hauteur });
			await anonyme.goto('/connexion');
			await photographier(anonyme, `connexion-${format.nom}-clair`);
			await anonyme.goto('/invitation/lien-inconnu');
			await photographier(anonyme, `invitation-refus-${format.nom}-clair`);
		}
		await invite.close();

		// Lien à usage unique et dialogue de révocation, avec leurs vrais contenus.
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/reglages/acces?acces=nouveau');
		await page.getByLabel('Identifiant').fill(`capture${Date.now()}`);
		await page.getByLabel('Nom affiché').fill('Personne Fictive');
		await page.getByRole('button', { name: 'Créer l’Accès' }).click();
		await page.locator('code').waitFor();
		await photographier(page, 'acces-lien-ordinateur-clair');
		await page.getByRole('button', { name: 'Fermer' }).last().click();
		await page.getByRole('button', { name: 'Révoquer' }).first().click();
		await photographier(page, 'acces-revoquer-ordinateur-clair');
		await page.setViewportSize({ width: 390, height: 780 });
		await photographier(page, 'acces-revoquer-telephone-clair');
	});
});
