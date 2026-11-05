/**
 * Vérification UX du jalon 3 (story 11.3), sur le serveur construit.
 * Toujours : console sans erreur, un seul `h1`, vocabulaire, parcours au clavier seul.
 * Avec `CAPTURES=<dossier>` : chaque écran à 1280, 800 et 320 px, en clair et en sombre.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { toucheLiens } from './aides.ts';
import {
	JETON_LECTEUR,
	JETON_TRESORIER,
	preparerInstanceEtats,
	type JeuEtats
} from './aides-etats.ts';
import { demarrerServeur } from './aides-instance.ts';
import { panneau } from './aides-operations.ts';
import {
	ecransLecteur,
	ecransV1,
	JETONS_V1,
	preparerInstanceV1,
	type InstanceV1,
	type RoleV1
} from './aides-v1.ts';

const PORT_V1 = 4196;
const PORT_ETATS = 4197;
const V1 = `http://localhost:${PORT_V1}`;
const ETATS = `http://localhost:${PORT_ETATS}`;
const captures = process.env.CAPTURES;
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');
const entetes = { 'x-forwarded-proto': 'http' };
/** FR-42 : ces mots ne s'affichent jamais. L'aide les nomme pour dire qu'ils n'existent pas. */
const INTERDITS = /\b(d[ée]bits?|cr[ée]dits?|contreparties?)\b/i;

test.use({ extraHTTPHeaders: entetes });
test.describe.configure({ timeout: captures ? 1_500_000 : 120_000 });

const FORMATS = [
	{ nom: '1280', width: 1280, height: 800 },
	{ nom: '800', width: 800, height: 900 },
	{ nom: '320', width: 320, height: 640 }
];
const THEMES = [
	['clair', 'light'],
	['sombre', 'dark']
] as const;

let dossierV1: string;
let dossierEtats: string;
let serveurs: ChildProcess[] = [];
let v: InstanceV1;
let jeu: JeuEtats;

test.beforeAll(async () => {
	dossierV1 = mkdtempSync(join(tmpdir(), 'ape-jalon-3-'));
	dossierEtats = mkdtempSync(join(tmpdir(), 'ape-jalon-3-etats-'));
	v = await preparerInstanceV1(dossierV1);
	jeu = preparerInstanceEtats(dossierEtats);
	serveurs = [
		await demarrerServeur(dossierV1, PORT_V1),
		await demarrerServeur(dossierEtats, PORT_ETATS)
	];
});

test.afterAll(() => {
	for (const s of serveurs) s.kill();
	rmSync(dossierV1, { recursive: true, force: true });
	rmSync(dossierEtats, { recursive: true, force: true });
});

function surveiller(page: Page) {
	const erreurs: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) {
			erreurs.push(`${page.url()} : ${m.text()}`);
		}
	});
	page.on('pageerror', (e) => erreurs.push(`${page.url()} : ${String(e)}`));
	return erreurs;
}

type Ecran = { nom: string; origine: string; url: string; jeton: string };

/** Factures, Budget, Comparaison, et tout ce que voit un·e lecteur·rice (story 11.3). */
function ecransDuJalon(): Ecran[] {
	const garde = /^(factures?|facture-|budget|document-ag|tresorerie|etats)/;
	const avecJeton = (role: RoleV1, nom: string, url: string): Ecran => ({
		nom,
		origine: V1,
		url,
		jeton: JETONS_V1[role]
	});
	return [
		...ecransV1(v)
			.filter((e) => garde.test(e.nom))
			.map((e) => avecJeton(e.role, e.nom, e.url)),
		...ecransLecteur(v).map((e) => avecJeton('lecteur', e.nom, e.url)),
		{
			nom: 'comparaison',
			origine: ETATS,
			url: `/etats?comparer=${jeu.ecoule}`,
			jeton: JETON_TRESORIER
		},
		{
			nom: 'lecture-comparaison',
			origine: ETATS,
			url: `/etats?comparer=${jeu.ecoule}`,
			jeton: JETON_LECTEUR
		},
		{
			nom: 'lecture-exercice-ecoule',
			origine: ETATS,
			url: `/actions?exercice=${jeu.ecoule}`,
			jeton: JETON_LECTEUR
		}
	];
}

test('chaque écran : console sans erreur, un seul h1, un titre, aucun mot interdit', async ({
	browser
}) => {
	test.setTimeout(captures ? 1_500_000 : 200_000);
	if (captures) mkdirSync(captures, { recursive: true });
	const largeur = process.env.CAPTURES_LARGEUR;
	const formats = captures
		? FORMATS.filter((f) => !largeur || f.nom === largeur)
		: FORMATS.slice(0, 1);
	for (const f of formats) {
		for (const [theme, colorScheme] of captures ? THEMES : THEMES.slice(0, 1)) {
			for (const e of ecransDuJalon()) {
				if (!filtre.test(e.nom)) continue;
				const contexte = await browser.newContext({
					viewport: { width: f.width, height: f.height },
					colorScheme,
					reducedMotion: 'reduce',
					locale: 'fr-FR',
					timezoneId: 'Europe/Paris',
					extraHTTPHeaders: entetes
				});
				await contexte.addCookies([{ name: 'ape_session', value: e.jeton, url: e.origine }]);
				const page = await contexte.newPage();
				const erreurs = surveiller(page);
				await page.goto(`${e.origine}${e.url}`, { waitUntil: 'networkidle' });
				if (captures) {
					await page.screenshot({
						path: join(captures, `${e.nom}-${f.nom}-${theme}.png`),
						fullPage: true
					});
				}
				expect(erreurs, e.nom).toEqual([]);
				await expect(page.locator('h1:visible'), e.nom).toHaveCount(1);
				expect((await page.title()).length, e.nom).toBeGreaterThan(0);
				if (e.nom !== 'lecture-aide') {
					// « Crédit du Vallon » est une banque du jeu fictif, pas un terme comptable.
					const texte = (await page.getByRole('main').innerText()).replaceAll(
						'Crédit du Vallon',
						''
					);
					expect(texte, e.nom).not.toMatch(INTERDITS);
				}
				await contexte.close();
			}
		}
	}
});

test('le Journal nomme chaque élément en français, sans code interne', async ({ page }) => {
	await page.context().addCookies([{ name: 'ape_session', value: JETONS_V1.tresorier, url: V1 }]);
	await page.goto(`${V1}/journal`, { waitUntil: 'networkidle' });
	const principal = page.getByRole('main');
	await expect(principal.getByRole('link', { name: 'Session de caisse' }).first()).toBeVisible();
	await expect(principal.getByRole('link', { name: 'Facture' }).first()).toBeVisible();
	expect(await principal.innerText()).not.toMatch(/\b[a-z]+_[a-z]+\b/);
	await expect(page.getByLabel('Type')).not.toContainText('_');
});

test('sur téléphone, l’onglet actif reste entier à l’écran', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.context().addCookies([{ name: 'ape_session', value: JETONS_V1.lecteur, url: V1 }]);
	await page.goto(`${V1}/etats/document-ag`, { waitUntil: 'networkidle' });
	const onglet = page.getByRole('link', { name: 'Document d’AG' });
	await expect(onglet).toBeInViewport({ ratio: 0.95 });
});

test('UJ-3 au clavier seul, lecture seule du début à la fin', async ({ page, browserName }) => {
	await page.context().addCookies([{ name: 'ape_session', value: JETON_LECTEUR, url: ETATS }]);
	await page.goto(`${ETATS}/actions`, { waitUntil: 'networkidle' });
	const lien = toucheLiens(browserName);
	await page.keyboard.press(lien);
	await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('main')).toBeFocused();

	// Tout ce que Tab rencontre dans la page se lit ou se déplie, rien ne se saisit.
	const grille = page.getByRole('treegrid').first();
	const groupe = grille.getByRole('row', { name: /Évènements/ });
	for (let i = 0; i < 12 && !(await groupe.evaluate((n) => n === document.activeElement)); i++) {
		await page.keyboard.press(lien);
	}
	await expect(groupe).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(groupe).toHaveAttribute('aria-expanded', 'true');
	const kermesse = grille.getByRole('row', { name: /Kermesse/ });
	await page.keyboard.press('ArrowDown');
	while (!(await kermesse.evaluate((n) => n === document.activeElement))) {
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('ArrowRight');
	await expect(kermesse).toHaveAttribute('aria-expanded', 'true');
	const transport = grille.getByRole('row', { name: /^Transport/ });
	while (!(await transport.evaluate((n) => n === document.activeElement))) {
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('ArrowRight');
	const ligne = grille.getByRole('row', { name: /Autocars du Vallon/ });
	await expect(ligne).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await expect(ligne).toBeFocused();
	await page.keyboard.press('Enter');
	const detail = page.getByRole('dialog');
	await expect(detail).toContainText('AUTOCARS DU VALLON');

	// Lecture seule : aucun champ à modifier dans la couche, Échap rend le focus à la Ligne.
	const modifiables = await detail.evaluate(
		(d) =>
			[...d.querySelectorAll('input, textarea, select')].filter(
				(c) => !(c as HTMLInputElement).readOnly && !(c as HTMLInputElement).disabled
			).length
	);
	expect(modifiables).toBe(0);
	await page.keyboard.press('Escape');
	await expect(detail).toHaveCount(0);
	await expect(page.locator(':focus')).toBeVisible();
});

test('UJ-4 au clavier seul : du lien à la première Opération', async ({ page, browser }) => {
	await page.context().addCookies([{ name: 'ape_session', value: JETONS_V1.tresorier, url: V1 }]);
	await page.goto(`${V1}/reglages/acces?acces=nouveau`, { waitUntil: 'networkidle' });
	await page.getByLabel('Identifiant').focus();
	await page.keyboard.type('sasha');
	await page.keyboard.press('Tab');
	await page.keyboard.type('Sasha Fictive');
	await page.keyboard.press('Enter');
	const lien = (await page.locator('code').textContent()) as string;

	const contexte = await browser.newContext({ extraHTTPHeaders: entetes });
	const sasha = await contexte.newPage();
	await sasha.goto(lien, { waitUntil: 'networkidle' });
	await sasha.keyboard.press('Tab');
	const champ = sasha.getByLabel('Mot de passe');
	for (let i = 0; i < 6 && !(await champ.evaluate((n) => n === document.activeElement)); i++) {
		await sasha.keyboard.press('Tab');
	}
	await sasha.keyboard.type('une transmission sans souris');
	await sasha.keyboard.press('Enter');
	await expect(sasha).toHaveURL(/\/$/);
	await sasha.waitForLoadState('networkidle');

	await sasha.keyboard.press('n');
	const d = panneau(sasha);
	await expect(d).toBeVisible();
	await d.getByLabel('Montant', { exact: true }).focus();
	await sasha.keyboard.type('12,30');
	await sasha.keyboard.press('Tab');
	await expect(sasha.locator(':focus')).toBeVisible();
	await d.getByLabel('Libellé').focus();
	await sasha.keyboard.type('Timbres fictifs');
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.focus();
	await sasha.keyboard.type('Fournitures');
	await sasha.keyboard.press('Enter');
	await sasha.keyboard.press('Control+Enter');
	await expect(sasha.getByRole('dialog')).toHaveCount(0);
	await contexte.close();
});

test('l’arbre d’accessibilité d’un écran en lecture nomme tout ce qui se lit', async ({ page }) => {
	await page.context().addCookies([{ name: 'ape_session', value: JETON_LECTEUR, url: ETATS }]);
	await page.goto(`${ETATS}/`, { waitUntil: 'networkidle' });
	const arbre = await page.getByRole('main').ariaSnapshot();
	expect(arbre).toContain('heading');
	expect(arbre).toMatch(/Solde calculé/);
	await page.goto(`${ETATS}/actions`, { waitUntil: 'networkidle' });
	const grille = await page.getByRole('main').ariaSnapshot();
	expect(grille).toContain('treegrid');
	expect(grille).toMatch(/row "Évènements/);
});
