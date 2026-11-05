/**
 * L'aperçu `iframe` du Document d'AG reste vide en headless : ce test ouvre le vrai Chrome, en
 * fenêtre, et ne tourne que sur demande. `NAVIGATEUR_REEL=<dossier>` y dépose la capture, à
 * regarder : le lecteur de Chrome n'expose rien au test, seule l'image prouve le rendu.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { chargerDansDossier, COMPTES_FICTIFS } from '../jeux/charger.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4181;
const dossierCaptures = process.env.NAVIGATEUR_REEL;
let dossier: string;
let serveur: ChildProcess;

test.skip(!dossierCaptures, 'Demande NAVIGATEUR_REEL=<dossier> et Google Chrome.');

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-pdf-'));
	chargerDansDossier(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

test('Chrome affiche le Document d’AG dans son iframe', async () => {
	test.setTimeout(60_000);
	const navigateur = await chromium.launch({ channel: 'chrome', headless: false });
	const contexte = await navigateur.newContext({
		baseURL: `http://localhost:${PORT}`,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		locale: 'fr-FR',
		viewport: { width: 1280, height: 900 }
	});
	const page = await contexte.newPage();
	const bloques: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') bloques.push(m.text());
	});
	await page.goto('/connexion');
	await page.getByLabel('Identifiant').fill(COMPTES_FICTIFS.tresorier.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES_FICTIFS.tresorier.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);

	const pdf = page.waitForResponse((r) => r.url().includes('/document-ag/pdf'));
	await page.goto('/etats/document-ag');
	const reponse = await pdf;
	expect(reponse.status()).toBe(200);
	expect(reponse.headers()['content-type']).toContain('application/pdf');
	expect(reponse.headers()['content-disposition']).toContain('inline');
	await page.waitForTimeout(4000);
	const cadre = page.frames().find((f) => f.url().includes('/document-ag/pdf'));
	expect(cadre, 'cadre du PDF').toBeDefined();
	await page.screenshot({ path: join(dossierCaptures as string, 'document-ag-chrome.png') });

	// L'aperçu d'une Facture passe par le même chemin : il suit la frappe, sans rien enregistrer.
	await page.goto('/factures/nouvelle');
	await page.getByLabel('Tiers').fill('Cantine fictive');
	await page.getByLabel('Désignation, ligne 1').fill('Repas de novembre');
	await page.getByLabel('Quantité, ligne 1').fill('120');
	await page.getByLabel('Prix unitaire, ligne 1').fill('3,50');
	const apercu = page.waitForResponse((r) => r.url().includes('/factures/apercu?v='));
	await page.getByLabel('Prix unitaire, ligne 1').blur();
	expect((await apercu).headers()['content-type']).toContain('application/pdf');
	await page.waitForTimeout(4000);
	await page.screenshot({ path: join(dossierCaptures as string, 'facture-chrome.png') });
	await navigateur.close();
	expect(bloques).toEqual([]);
});
