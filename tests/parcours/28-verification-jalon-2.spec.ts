/**
 * Vérification UX du jalon 2 (story 8.10), sur le serveur construit et le jeu fictif complet.
 * Toujours : console sans erreur, cibles au toucher, ordre de tabulation, arbre d'accessibilité.
 * Avec `CAPTURES=<dossier>` : chaque écran à 1280, 800, 390 et 320 px, en clair et en sombre.
 */
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { centimes as c } from '../../src/lib/domaine/montant.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { chargerDansDossier, type JeuCharge } from '../jeux/charger.ts';
import { toucheLiens } from './aides.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4188;
const ORIGINE = `http://localhost:${PORT}`;
const captures = process.env.CAPTURES;
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');
const JETONS = {
	tresorier: 'session-fictive-verification-tresorerie',
	compteur: 'session-fictive-verification-comptage',
	lecteur: 'session-fictive-verification-lecture'
};

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ timeout: captures ? 900_000 : 60_000 });

const FORMATS = [
	{ nom: '1280', width: 1280, height: 800 },
	{ nom: '800', width: 800, height: 900 },
	{ nom: '390', width: 390, height: 780 },
	{ nom: '320', width: 320, height: 640 }
];
const THEMES = [
	['clair', 'light'],
	['sombre', 'dark']
] as const;

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuCharge;
let session: number;
let remise: number;

/** Sam a un Accès à la caisse de la fête, et une Session y est ouverte. */
function preparer(d: string) {
	const j = chargerDansDossier(d);
	const base = ouvrirBase(join(d, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(d, 'fichiers')) });
	const depots = app.socle.depots;
	const maintenant = new Date().toISOString();
	const tresorier = depots.acces.lister().find((a) => a.role === 'tresorier')!;
	const lecteur = depots.acces.lister().find((a) => a.role === 'lecteur')!;
	const compteur = depots.acces.creer({
		identifiant: 'sam',
		nomAffiche: 'Sam Fictif',
		role: 'compteur',
		hash: 'sans-mot-de-passe',
		creeLe: maintenant
	});
	depots.acces.definirCaisses(compteur, [j.caisse]);
	const demain = new Date(Date.now() + 86_400_000).toISOString();
	for (const [jeton, accesId] of [
		[JETONS.tresorier, tresorier.id],
		[JETONS.lecteur, lecteur.id],
		[JETONS.compteur, compteur]
	] as const) {
		depots.acces.creerSession({
			hashJeton: createHash('sha256').update(jeton).digest('hex'),
			accesId,
			creeLe: maintenant,
			derniereActiviteLe: maintenant,
			expireLe: demain
		});
	}
	const ctx = app.ctx(depots.acces.parId(tresorier.id));
	const date = ctx.aujourdhui;
	const r = app.caisses.compterCaisse(ctx, {
		compteId: j.caisse,
		actionId: j.kermesse,
		date,
		confirmation: c(90_00),
		coupures: [
			{ coupure: c(2000), quantite: 4 },
			{ coupure: c(1000), quantite: 1 }
		]
	});
	if (!r.ok || r.valeur.sessionId === null) throw new Error('Session de la vérification');
	const remises = depots.operations.journal().remises;
	base.close();
	return { j, session: r.valeur.sessionId, remise: remises[0]!.id };
}

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-jalon-2-'));
	({ j: jeu, session, remise } = preparer(dossier));
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function connecte(page: Page, role: keyof typeof JETONS = 'tresorier') {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

function surveiller(page: Page) {
	const erreurs: string[] = [];
	page.on('console', (m) => {
		// Le navigateur note lui-même une requête coupée : c'est l'état que l'on provoque.
		if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) {
			erreurs.push(`${page.url()} : ${m.text()}`);
		}
	});
	page.on('pageerror', (e) => erreurs.push(`${page.url()} : ${String(e)}`));
	return erreurs;
}

const ecrans = (): [string, string, keyof typeof JETONS][] => [
	['caisses', '/caisses', 'tresorier'],
	['detail-caisse', `/caisses/${jeu.caisse}`, 'tresorier'],
	['session', `/sessions/${session}`, 'tresorier'],
	['mes-caisses', '/mes-caisses', 'compteur'],
	['comptage', `/sessions/${session}/comptage`, 'compteur'],
	['cheques-recus', '/cheques', 'tresorier'],
	['cheques-tous', '/cheques?etat=tous', 'tresorier'],
	['cheque-panneau', '/cheques?cheque=nouveau', 'tresorier'],
	['remises', '/cheques/remises', 'tresorier'],
	['remise', `/cheques/remises/${remise}`, 'tresorier'],
	['nouvelle-remise', '/cheques/remises/nouvelle', 'tresorier'],
	['emis', '/cheques/emis', 'tresorier'],
	['pointage', `/pointage/${jeu.banque}`, 'tresorier'],
	['tableau', '/', 'tresorier'],
	['tresorerie', '/etats/tresorerie', 'tresorier'],
	['lecture-cheques', '/cheques?etat=tous', 'lecteur'],
	['aide', '/aide#cheques-recus', 'tresorier']
];

test('chaque écran du jalon 2 s’affiche sans erreur de console, dans chaque format', async ({
	browser
}) => {
	test.setTimeout(captures ? 900_000 : 120_000);
	if (captures) mkdirSync(captures, { recursive: true });
	for (const f of FORMATS) {
		for (const [theme, colorScheme] of captures ? THEMES : THEMES.slice(0, 1)) {
			for (const [nom, url, role] of ecrans()) {
				if (!filtre.test(nom)) continue;
				const contexte = await browser.newContext({
					viewport: { width: f.width, height: f.height },
					colorScheme,
					reducedMotion: 'reduce',
					locale: 'fr-FR',
					timezoneId: 'Europe/Paris',
					extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
				});
				const page = await contexte.newPage();
				const erreurs = surveiller(page);
				await connecte(page, role);
				await page.goto(`${ORIGINE}${url}`, { waitUntil: 'networkidle' });
				if (captures) {
					await page.screenshot({
						path: join(captures, `${nom}-${f.nom}-${theme}.png`),
						fullPage: true
					});
				}
				expect(erreurs, nom).toEqual([]);
				await contexte.close();
			}
		}
	}
});

test.describe('UJ-2 sur téléphone, au toucher', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });

	test('les cibles font 48 px, 56 px sur le Comptage, et le total reste visible', async ({
		page
	}) => {
		const erreurs = surveiller(page);
		await connecte(page, 'compteur');
		await page.goto('/mes-caisses');
		const mesures = (selecteur: string) =>
			page.locator(selecteur).evaluateAll((e) =>
				e
					.filter((x) => (x as HTMLElement).offsetParent !== null)
					.map((x) => ({
						texte: x.getAttribute('aria-label') ?? x.textContent?.trim() ?? '',
						hauteur: x.getBoundingClientRect().height
					}))
			);
		for (const m of await mesures('main a, main button')) {
			expect(m.hauteur, m.texte).toBeGreaterThanOrEqual(48);
		}
		await page.goto(`/sessions/${session}/comptage`);
		const plus = page.getByRole('button', { name: /^Ajouter : / });
		for (const m of await plus.evaluateAll((e) =>
			e.map((x) => ({ texte: x.getAttribute('aria-label'), h: x.getBoundingClientRect().height }))
		)) {
			expect(m.h, m.texte ?? '').toBeGreaterThanOrEqual(56);
		}
		// Un vrai clavier ne réduit pas la fenêtre : seul le viewport visuel rétrécit, et une barre
		// collée au bas de la fenêtre passe dessous. Vu sur iOS, invisible en réduisant la fenêtre.
		const quantite = page.getByRole('textbox').nth(3);
		await quantite.tap();
		const hauteurClavier = 340;
		await page.evaluate((h) => {
			const vv = window.visualViewport as VisualViewport;
			const hauteur = window.innerHeight - h;
			Object.defineProperty(vv, 'height', { get: () => hauteur, configurable: true });
			vv.dispatchEvent(new Event('resize'));
		}, hauteurClavier);
		await quantite.fill('3');
		const hautClavier = (page.viewportSize()?.height ?? 0) - hauteurClavier;
		const bas = async (l: Locator) => (await l.boundingBox())?.y ?? Infinity;
		const barre = page.locator('.total-comptage');
		await expect
			.poll(async () => (await barre.boundingBox())?.y ?? Infinity)
			.toBeLessThan(hautClavier);
		const cadre = await barre.boundingBox();
		expect((cadre?.y ?? 0) + (cadre?.height ?? 0)).toBeLessThanOrEqual(hautClavier + 1);
		const champ = await quantite.boundingBox();
		expect(
			(champ?.y ?? 0) + (champ?.height ?? 0),
			'champ actif au-dessus du total'
		).toBeLessThanOrEqual(await bas(barre));
		expect(erreurs).toEqual([]);
	});
});

test('UJ-1 au clavier : l’ordre de tabulation de la rafale suit la pile', async ({
	page,
	browserName
}) => {
	await connecte(page);
	await page.goto('/cheques');
	await expect(page.locator('#rafale-emetteur')).toBeFocused();
	for (const id of [
		'rafale-banque',
		'rafale-montant',
		'rafale-date',
		'rafale-action',
		'rafale-nature'
	]) {
		await page.keyboard.press('Tab');
		// Le champ date natif compte plusieurs arrêts selon le navigateur.
		while (!(await page.evaluate((i) => document.activeElement?.id === i, id))) {
			const ici = await page.evaluate(() => document.activeElement?.id);
			if (ici !== 'rafale-date') throw new Error(`Arrêt inattendu avant ${id} : ${ici}`);
			await page.keyboard.press('Tab');
		}
		const contour = await page.evaluate(() => {
			const s = getComputedStyle(document.activeElement as Element);
			const parent = getComputedStyle((document.activeElement as Element).parentElement!);
			return s.outlineStyle !== 'none' || parent.outlineStyle !== 'none' || s.boxShadow !== 'none';
		});
		expect(contour, `${id} sans repère de focus`).toBe(true);
	}
	await page.keyboard.press(toucheLiens(browserName));
	await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeFocused();
});

test('arbre d’accessibilité : un h1 et un titre unique sur chaque écran Chèques', async ({
	page
}) => {
	await connecte(page);
	const titres = new Set<string>();
	for (const url of [
		'/cheques',
		'/cheques/remises',
		'/cheques/emis',
		'/cheques/remises/nouvelle',
		`/cheques/remises/${remise}`
	]) {
		await page.goto(url, { waitUntil: 'networkidle' });
		await expect(page.locator('h1'), url).toHaveCount(1);
		await expect(page.locator('main')).toHaveCount(1);
		const titre = await page.title();
		expect(titres.has(titre), `${url} : ${titre}`).toBe(false);
		titres.add(titre);
	}
});
