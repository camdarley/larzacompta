/**
 * Non-régression des défauts d'interface et de sécurité HTTP de la revue indépendante,
 * au vrai clavier et sur le serveur construit. La clôture vient en dernier : elle fige le jeu.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { chargerDansDossier, COMPTES_FICTIFS, type JeuCharge } from '../jeux/charger.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4181;
const ORIGINE = `http://localhost:${PORT}`;

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ timeout: process.env.CAPTURES ? 300_000 : 45_000 });

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuCharge;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-revue-'));
	jeu = chargerDansDossier(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

const captures = process.env.CAPTURES;

/** Avec `CAPTURES=<dossier>` : ordinateur et téléphone, en clair et en sombre. */
async function photographier(page: Page, nom: string, url: string) {
	if (!captures) return;
	for (const [format, width, height] of [
		['1280', 1280, 800],
		['390', 390, 844]
	] as const) {
		await page.setViewportSize({ width, height });
		for (const theme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			await page.screenshot({ path: join(captures, `${nom}-${format}-${theme}.png`) });
		}
	}
	await page.setViewportSize({ width: 1280, height: 720 });
}

async function connecter(page: Page, a = COMPTES_FICTIFS.tresorier) {
	await page.goto('/connexion');
	await page.getByLabel('Identifiant').fill(a.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(a.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);
}

const nomDuFocus = (page: Page) =>
	page.evaluate(() => {
		const e = document.activeElement as HTMLElement | null;
		const label = e?.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent : null;
		return (label ?? e?.getAttribute('aria-label') ?? e?.textContent ?? e?.tagName ?? '').trim();
	});

test('Tab parcourt tout le panneau Opération, de `n` à Enregistrer', async ({ page }) => {
	await connecter(page);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('n');
	await expect(page.getByRole('dialog')).toBeVisible();
	const vus: string[] = [];
	for (let i = 0; i < 40; i++) {
		await page.keyboard.press('Tab');
		const nom = await nomDuFocus(page);
		vus.push(nom);
		if (nom.startsWith('Enregistrer')) break;
	}
	expect(vus.at(-1)).toMatch(/^Enregistrer/);
	expect(vus).not.toContain('En savoir plus');
	for (const champ of ['Compte', 'Libellé', 'Montant']) {
		expect(vus.join(' | ')).toContain(champ);
	}
});

test('Entrée sur un mot du glossaire atteint son lien, Tab reprend ensuite', async ({ page }) => {
	await connecter(page);
	await page.goto('/?op=nouvelle');
	await page.waitForLoadState('networkidle');
	const terme = page.getByRole('dialog').locator('.mot').first();
	await terme.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('link', { name: 'En savoir plus' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'En savoir plus' })).toHaveCount(0);
	expect(await nomDuFocus(page)).not.toBe('Fermer');
});

test('La palette repart d’un champ vide après Échap', async ({ page }) => {
	await connecter(page);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('Control+k');
	await page.keyboard.type('nouvelle');
	await page.keyboard.press('Escape');
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('');
	await page.keyboard.type('kermesse');
	await expect(page.getByRole('dialog').getByRole('combobox')).toHaveValue('kermesse');
	await expect(page.getByRole('dialog').getByText('Kermesse').first()).toBeVisible();
});

test('« Ce champ est à remplir » disparaît dès que le montant est saisi', async ({ page }) => {
	await connecter(page);
	await page.goto('/operations?op=nouvelle');
	const dialogue = page.getByRole('dialog');
	await dialogue
		.getByRole('button', { name: /^Enregistrer/ })
		.first()
		.click();
	const montant = dialogue.locator('#op-montant');
	await expect(montant).toHaveAttribute('aria-invalid', 'true');
	await montant.fill('1000');
	await montant.press('Tab');
	await expect(montant).not.toHaveAttribute('aria-invalid', 'true');
});

test('Après un import, le focus est dans la file et Entrée pointe', async ({ page }) => {
	await connecter(page);
	await page.goto(`/pointage/${jeu.banque}`);
	await page.waitForLoadState('networkidle');
	const ofx = ofxCp1252(
		ofxTexte([{ date: '20261102', montant: '-3.25', id: 'REVUE-1', libelle: 'FRAIS FICTIFS' }], {
			montant: '1000.00',
			date: '20261103'
		})
	);
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({
			name: 'revue.ofx',
			mimeType: 'application/x-ofx',
			buffer: Buffer.from(ofx)
		});
	await expect(page.getByText(/1 nouvelle/)).toBeVisible();
	await expect(page.locator('[data-ligne]:focus')).toHaveCount(1);
});

test('Lecteur : la fiche de l’association ne sort pas par un masque d’invalidation', async ({
	page
}) => {
	await connecter(page, COMPTES_FICTIFS.lecteur);
	const r = await page.request.get('/reglages/__data.json?x-sveltekit-invalidated=0001');
	expect(await r.text()).not.toContain('moisDebutExercice');
});

test('Origine contrôlée même sur un chemin encodé', async ({ page }) => {
	await connecter(page);
	const r = await page.request.post('/%61pi/natures', {
		headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
		data: { libelle: 'SondeContournee' }
	});
	expect(r.status()).toBe(403);
});

test('Une `suite` piégée ne donne plus de 500', async ({ page }) => {
	await connecter(page);
	const r = await page.request.get('/connexion?suite=/%09/evil.example', { maxRedirects: 0 });
	expect(r.status()).toBe(303);
	expect(r.headers().location).toBe('/');
});

test('Une page de Journal démesurée répond, et l’export de CSV n’est pas mis en cache', async ({
	page
}) => {
	await connecter(page);
	for (const p of ['1e999', 'Infinity', '99999999999999999999']) {
		expect((await page.request.get(`/journal?page=${p}`)).status()).toBe(200);
	}
	const csv = await page.request.get('/operations/export');
	expect(csv.headers()['cache-control']).toBe('private, no-store');
	expect(csv.headers()['content-type']).toContain('text/csv');
});

test('Une session prolongée repose son cookie', async ({ page }) => {
	await connecter(page);
	const base = new Database(join(dossier, 'base.sqlite'));
	const avant = new Date(Date.now() - 2 * 86_400_000).toISOString();
	base
		.prepare('UPDATE session_connexion SET derniere_activite_le = ?, cree_le = ?')
		.run(avant, avant);
	base.close();
	const r = await page.request.get('/operations');
	expect(r.headers()['set-cookie']).toContain('ape_session=');
});

test('Le Journal lie ses éléments et n’affiche aucun identifiant technique', async ({ page }) => {
	await connecter(page);
	await page.goto('/journal?type=operation');
	await expect(page.getByRole('link', { name: 'Opération' }).first()).toBeVisible();
	await page.goto('/journal');
	await expect(page.locator('td.element', { hasText: 'creance_dette' })).toHaveCount(0);
	await expect(page.locator('td.element', { hasText: /^\s*piece\s*$/ })).toHaveCount(0);
});

test('Exercice clôturé : Pointage en consultation, panneau sans formulaire inutile', async ({
	page
}) => {
	await connecter(page);
	await page.goto(`/reglages/exercices/${jeu.exercice.courant}/cloture`);
	await page.getByRole('button', { name: /Clôturer/ }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Clôturer/ })
		.click();
	await expect(page.getByText(/est clôturé|clôturé le/i).first()).toBeVisible();

	await page.goto(`/pointage/${jeu.banque}`);
	await expect(page.getByText('Exercice clôturé, lecture seule')).toBeVisible();
	await expect(page.locator('.barre-ecart')).toBeVisible();
	for (const nom of [/^Pointer/, /^Créer/, /^Relier/, /^Passer/, 'Saisir une ligne']) {
		await expect(page.getByRole('button', { name: nom })).toHaveCount(0);
	}
	await expect(page.getByRole('button', { name: 'Importer un relevé' })).toHaveCount(0);

	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Exercice clôturé');
	await expect(page.getByRole('heading', { name: 'À faire' })).toHaveCount(0);

	await page.goto('/operations?op=nouvelle');
	await expect(page.getByText(/Aucun Exercice n’est ouvert/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ouvrir l’Exercice suivant' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Enregistrer/ })).toHaveCount(0);

	await photographier(page, 'clos-pointage', `/pointage/${jeu.banque}`);
	await photographier(page, 'clos-tableau', '/');
	await photographier(page, 'clos-pieces', '/pieces');
	await photographier(page, 'clos-nouvelle', '/operations?op=nouvelle');
	await photographier(page, 'clos-journal', '/journal');
	await photographier(page, 'clos-aide', '/aide');
	await photographier(page, 'clos-etats', '/etats');
});
