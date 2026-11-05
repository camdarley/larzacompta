/**
 * Plancher UX-DR23 : 200 % de zoom, et usage au doigt sur un gabarit de téléphone, en portrait et
 * en paysage. Zoomer à 200 % un navigateur de 1280 × 800 donne à la mise en page 640 × 400 px CSS.
 * Le rendu d'un vrai téléphone reste à voir par une personne : ceci est de l'émulation Chromium.
 * Avec `CAPTURES=<dossier>`, chaque écran est capturé dans chaque format.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { chargerDansDossier, COMPTES_FICTIFS, type JeuCharge } from '../jeux/charger.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4180;
const ORIGINE = `http://localhost:${PORT}`;
const captures = process.env.CAPTURES;

const FORMATS = [
	{ nom: 'zoom-200', largeur: 640, hauteur: 400, echelle: 2, tactile: false },
	{ nom: 'telephone', largeur: 390, hauteur: 844, echelle: 3, tactile: true },
	{ nom: 'paysage', largeur: 844, hauteur: 390, echelle: 3, tactile: true }
];

const ecrans = (j: JeuCharge): [string, string][] => [
	['tableau', '/'],
	['operations', '/operations'],
	['panneau', '/operations?op=1'],
	['panneau-nouvelle', '/operations?op=nouvelle'],
	['pointage', `/pointage/${j.banque}`],
	['creances-dettes', '/creances-dettes'],
	['pieces', '/pieces'],
	['actions', '/actions'],
	['action', `/actions/${j.kermesse}`],
	['etats', '/etats'],
	['tresorerie', '/etats/tresorerie'],
	['document-ag', '/etats/document-ag'],
	['cloture', `/reglages/exercices/${j.exercice.courant}/cloture`],
	['reglages', '/reglages'],
	['sauvegardes', '/reglages/sauvegardes'],
	['journal', '/journal'],
	['aide', '/aide']
];

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuCharge;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-zoom-'));
	jeu = chargerDansDossier(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function ouvrir(browser: Browser, f: (typeof FORMATS)[number], schema: 'light' | 'dark') {
	const contexte = await browser.newContext({
		baseURL: ORIGINE,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris',
		viewport: { width: f.largeur, height: f.hauteur },
		deviceScaleFactor: f.echelle,
		hasTouch: f.tactile,
		isMobile: f.tactile,
		colorScheme: schema,
		reducedMotion: 'reduce'
	});
	const page = await contexte.newPage();
	await page.goto('/connexion');
	await page.getByLabel('Identifiant').fill(COMPTES_FICTIFS.tresorier.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES_FICTIFS.tresorier.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);
	return page;
}

/** Ce qu'un écran ne doit pas faire : déborder, ou laisser le chrome couvrir le contenu. */
async function constats(page: Page) {
	return page.evaluate(() => {
		const racine = document.documentElement;
		const hauteurEcran = window.innerHeight;
		const fixes = [...document.querySelectorAll<HTMLElement>('body *')].filter((e) => {
			const p = getComputedStyle(e).position;
			if (p !== 'fixed' && p !== 'sticky') return false;
			if (e.closest('[role="dialog"], dialog, main')) return false;
			const r = e.getBoundingClientRect();
			return r.width > window.innerWidth / 2 && r.height > 0 && r.height < hauteurEcran;
		});
		return {
			debord: racine.scrollWidth - racine.clientWidth,
			fautif: [...document.querySelectorAll<HTMLElement>('body *')]
				.filter((e) => e.getBoundingClientRect().right > racine.clientWidth + 1)
				.slice(0, 4)
				.map((e) => `${e.tagName}.${e.className}`)
				.join(' | '),
			chrome: fixes.reduce((t, e) => t + e.getBoundingClientRect().height, 0) / hauteurEcran,
			titre: !!document.querySelector('h1')
		};
	});
}

/** Les commandes visibles trop petites pour un doigt, hors liens dans un texte. */
async function ciblesPetites(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="button"]')]
			.filter((e) => {
				const r = e.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) return false;
				if (getComputedStyle(e).visibility === 'hidden') return false;
				if (e.matches('a') && e.closest('p, li, td, th, [role="gridcell"]')) return false;
				if (e.matches('input[type="checkbox"], input[type="radio"]')) return false;
				// Le lien d'évitement n'apparaît qu'au clavier.
				if (e.matches('a[href="#contenu"], a[href="#principal"]')) return false;
				// Un mot du glossaire garde sa ligne : sa zone de doigt est dans `::after`.
				if (e.matches('.mot')) {
					const zone = parseFloat(getComputedStyle(e, '::after').height);
					return r.width < 24 || zone < 44;
				}
				return r.height < 44 || r.width < 44;
			})
			.map((e) => {
				const r = e.getBoundingClientRect();
				const nom = e.getAttribute('aria-label') ?? e.textContent ?? e.tagName;
				return `${nom.trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`;
			})
	);
}

test('une saisie faite avant la fin du chargement survit à l’hydratation', async ({ page }) => {
	// Téléphone lent : la page est là, le script pas encore.
	let lacher = () => {};
	const script = new Promise<void>((r) => (lacher = r));
	await page.route('**/_app/immutable/**', async (route) => {
		await script;
		await route.continue();
	});
	await page.goto(`${ORIGINE}/connexion`, { waitUntil: 'commit' });
	const identifiant = page.getByLabel('Identifiant');
	await identifiant.fill(COMPTES_FICTIFS.tresorier.identifiant);
	lacher();
	await page.waitForLoadState('networkidle');
	// L'hydratation ne laisse aucune trace publique : on lui laisse le temps de passer.
	await page.waitForTimeout(500);
	await expect(identifiant).toHaveValue(COMPTES_FICTIFS.tresorier.identifiant);
});

for (const format of FORMATS) {
	test(`aucun écran ne déborde en ${format.nom}`, async ({ browser }) => {
		test.setTimeout(captures ? 300_000 : 60_000);
		const page = await ouvrir(browser, format, 'light');
		const fautes: string[] = [];
		for (const [nom, url] of ecrans(jeu)) {
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			const c = await constats(page);
			if (c.debord > 0) fautes.push(`${nom} : ${c.debord} px de trop (${c.fautif})`);
			if (!c.titre) fautes.push(`${nom} : pas de titre`);
			if (c.chrome > 0.5) fautes.push(`${nom} : ${Math.round(c.chrome * 100)} % de chrome`);
			if (format.tactile) {
				for (const p of await ciblesPetites(page)) fautes.push(`${nom} : cible ${p}`);
			}
			if (captures) {
				mkdirSync(captures, { recursive: true });
				for (const [theme, schema] of [
					['clair', 'light'],
					['sombre', 'dark']
				] as const) {
					await page.emulateMedia({ colorScheme: schema });
					await page.screenshot({ path: join(captures, `${nom}-${format.nom}-${theme}.png`) });
				}
				await page.emulateMedia({ colorScheme: 'light' });
			}
		}
		await page.context().close();
		expect(fautes).toEqual([]);
	});
}
