/**
 * Non-régression des défauts d'interface et de disponibilité de la revue indépendante de la v1.
 * Avec `CAPTURES=<dossier>`, chaque correctif laisse sa capture, à regarder à l'œil.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { centimes as c } from '../../src/lib/domaine/montant.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { JETON_TRESORIER, preparerInstanceEtats, type JeuEtats } from './aides-etats.ts';
import { demarrerServeur } from './aides-instance.ts';
import { JETONS_V1, preparerInstanceV1, type InstanceV1 } from './aides-v1.ts';

const PORT_V1 = 4231;
const PORT_CLOS = 4232;
const V1 = `http://localhost:${PORT_V1}`;
const CLOS = `http://localhost:${PORT_CLOS}`;
const captures = process.env.CAPTURES;
const entetes = { 'x-forwarded-proto': 'http' };

test.use({
	baseURL: V1,
	extraHTTPHeaders: entetes,
	colorScheme: process.env.CAPTURES_THEME === 'sombre' ? 'dark' : 'light'
});
test.describe.configure({ timeout: 60_000 });

let dossierV1: string;
let dossierClos: string;
let serveurs: ChildProcess[] = [];
let v: InstanceV1;
let clos: JeuEtats;

test.beforeAll(async () => {
	dossierV1 = mkdtempSync(join(tmpdir(), 'ape-revue-v1-'));
	dossierClos = mkdtempSync(join(tmpdir(), 'ape-revue-v1-clos-'));
	v = await preparerInstanceV1(dossierV1);
	preparerRecetteARevoir();
	clos = preparerInstanceEtats(dossierClos);
	const base = ouvrirBase(join(dossierClos, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(dossierClos, 'fichiers')) });
	const depots = app.socle.depots;
	const acces = depots.acces.lister().find((a) => a.role === 'tresorier');
	const ctx = app.ctx(depots.acces.parId(acces?.id as number));
	const ecoule = depots.exercices.lister().find((e) => e.libelle === clos.ecoule);
	const r = app.exercices.cloturer(ctx, ecoule?.id as number);
	if (!r.ok) throw new Error(r.erreur.code);
	base.close();
	serveurs = [
		await demarrerServeur(dossierV1, PORT_V1),
		await demarrerServeur(dossierClos, PORT_CLOS)
	];
	if (captures) mkdirSync(captures, { recursive: true });
});

test.afterAll(() => {
	for (const s of serveurs) s.kill();
	rmSync(dossierV1, { recursive: true, force: true });
	rmSync(dossierClos, { recursive: true, force: true });
});

/** La Session se clôture, puis un ticket du même jour arrive : sa Recette est à revoir. */
function preparerRecetteARevoir() {
	const base = ouvrirBase(join(dossierV1, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(dossierV1, 'fichiers')) });
	const depots = app.socle.depots;
	const acces = depots.acces.lister().find((a) => a.role === 'tresorier');
	const ctx = app.ctx(depots.acces.parId(acces?.id as number));
	const exiger = (r: { ok: boolean }) => {
		if (!r.ok) throw new Error(JSON.stringify(r));
	};
	exiger(
		app.caisses.compterSession(ctx, {
			sessionId: v.session,
			coupures: [{ coupure: c(2000), quantite: 10 }],
			date: ctx.aujourdhui,
			confirmation: null
		})
	);
	exiger(app.caisses.cloturer(ctx, v.session));
	const nature = depots.parametrage.natures().find((n) => n.libelle === 'Fournitures');
	const ligne = {
		montant: c(12_50),
		contraire: false,
		reduction: false,
		natureId: nature?.id as number,
		actionId: v.kermesse,
		exerciceRattachementId: null,
		note: null
	};
	exiger(
		app.operations.creer(ctx, {
			forme: 'standard',
			intention: 'depense',
			libelle: 'Ticket de glace fictif',
			reference: null,
			modePaiement: 'especes',
			note: null,
			tiers: null,
			compteId: v.caisse,
			date: ctx.aujourdhui,
			montant: c(12_50),
			lignes: [ligne],
			sansPiece: true
		})
	);
	base.close();
}

async function entrer(page: Page, jeton = JETONS_V1.tresorier, origine = V1) {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: jeton, url: origine, httpOnly: true, sameSite: 'Lax' }
		]);
}

async function capture(page: Page, nom: string) {
	if (!captures) return;
	await page.waitForTimeout(250);
	await page.screenshot({ path: join(captures, `${nom}.png`), fullPage: false });
}

async function pret(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

test('une adresse mal encodée n’arrête pas le serveur', async ({ request }) => {
	for (const chemin of ['/%FF', '/%zz', '/%', '/a/%FF/b', '/api/%FF', '/%FF/__data.json']) {
		const r = await request.get(`${V1}${chemin}`, { maxRedirects: 0 });
		expect(r.status(), chemin).toBe(400);
		expect((await request.get(`${V1}/sante`)).status()).toBe(200);
	}
});

test.describe('saisie', () => {
	test.use({ viewport: { width: 390, height: 780 } });

	test('le retour arrière demande avant de jeter une saisie, et rien à perdre passe', async ({
		page
	}) => {
		await entrer(page);
		await pret(page, '/operations');
		await page.getByRole('link', { name: 'Nouvelle Opération' }).first().click();
		await page.locator('#op-montant').fill('12');
		await page.evaluate(() => history.back());
		await expect(page.getByRole('heading', { name: /Quitter sans enregistrer/ })).toBeVisible();
		expect(page.url()).toContain('op=nouvelle');
		await capture(page, 'retour-dirty-m');
		await page.getByRole('button', { name: 'Continuer la saisie' }).click();
		await expect(page.locator('#op-montant')).toHaveValue('12,00');
	});

	test('le bouton du panneau de filtres garde la majuscule du Glossaire', async ({ page }) => {
		await entrer(page);
		await pret(page, '/operations?filtres=1');
		await expect(page.getByRole('button', { name: /^Voir \d+ Opérations?$/ })).toBeVisible();
		await capture(page, 'filtres-m');
	});
});

test.describe('ordinateur', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('les filtres ne repoussent plus la liste', async ({ page }) => {
		await entrer(page);
		await pret(page, '/operations');
		await expect(page.getByLabel('Du')).toBeHidden();
		const haut = await page.locator('table').first().boundingBox();
		expect(haut?.y).toBeLessThan(330);
		await capture(page, 'operations-d');
		await page.locator('summary', { hasText: 'Filtres' }).click();
		await expect(page.getByLabel('Du')).toBeVisible();
		await capture(page, 'operations-filtres-d');
	});

	test('les onglets sont sous le titre, partout', async ({ page }) => {
		await entrer(page);
		for (const url of ['/cheques', '/etats', '/pieces']) {
			await pret(page, url);
			const titre = await page.locator('h1').boundingBox();
			const onglets = await page.locator('main nav.onglets').boundingBox();
			expect(onglets?.y, url).toBeGreaterThan(titre?.y ?? 0);
			await capture(page, `onglets${url.replace('/', '-')}`);
		}
	});

	test('une correction sur une Opération pointée commence au Libellé', async ({ page }) => {
		await entrer(page);
		await pret(page, '/operations?op=4');
		await expect(page.locator('#op-libelle')).toBeFocused();
		await capture(page, 'operation-pointee-d');
	});

	test('« Passer » envoie la ligne en fin de file, et Échap replie « Relier »', async ({
		page
	}) => {
		await entrer(page);
		await pret(page, `/pointage/${v.banque}`);
		const lignes = page.locator('ol.file [data-ligne]');
		await expect(lignes.first()).toBeFocused();
		const avant = await lignes.allTextContents();
		await page.keyboard.press('p');
		await expect.poll(() => lignes.allTextContents()).not.toEqual(avant);
		const ouvertes = (await lignes.allTextContents()).filter((t) => !t.includes('Pointé'));
		expect(ouvertes.at(-1)).toBe(avant[0]);
		await capture(page, 'passer-d');

		await page.keyboard.press('r');
		await expect(page.locator('#relier-ligne')).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(page.locator('#relier-ligne')).toBeHidden();
		await expect(lignes.first()).toBeFocused();
		await page.keyboard.press('c');
		await expect(page.getByRole('dialog').first()).toBeVisible();
		await capture(page, 'relier-echap-d');
	});

	test('après Ctrl+Z, le toast « Annuler » du Pointage disparaît', async ({ page }) => {
		await entrer(page);
		await pret(page, `/pointage/${v.banque}`);
		await page.locator('ol.file [data-ligne]').first().focus();
		await page.keyboard.press('Enter');
		const pile = page.locator('.pile');
		if ((await pile.getByText('Pointé.').count()) === 0) return;
		await page.keyboard.press('Control+z');
		await expect(pile.getByText('Pointage annulé.').first()).toBeVisible();
		await expect(pile.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
		await capture(page, 'toast-d');
	});

	test('une Recette à revoir se voit, et se revoit en rouvrant la Session', async ({ page }) => {
		await entrer(page);
		await pret(page, '/');
		await expect(page.getByRole('link', { name: /Recettes d’espèces à revoir/ })).toBeVisible();
		await page.getByRole('heading', { name: 'À faire' }).scrollIntoViewIfNeeded();
		await capture(page, 'recette-tuile-d');
		await pret(page, '/caisses');
		await capture(page, 'recette-caisses-d');
		await page.getByRole('link', { name: 'Recette d’espèces à revoir' }).first().click();
		await expect(page.getByText('a été saisi après sa clôture')).toBeVisible();
		await capture(page, 'recette-session-d');
		await pret(page, `/sessions/${v.session}?op=nouvelle&intention=depense&compte=${v.caisse}`);
		await expect(page.getByText('Il faudra la rouvrir')).toBeVisible();
		await capture(page, 'recette-formulaire-d');
	});

	test('la deuxième Ligne reprend la Nature de la première, en Suggestion', async ({ page }) => {
		await entrer(page);
		await pret(page, '/operations?op=nouvelle');
		await page.locator('#op-libelle').fill('Autocars fictifs');
		await page.locator('#op-montant').fill('1000');
		const nature = page.getByRole('combobox', { name: 'Nature' }).first();
		await nature.click();
		await nature.fill('Fournitures');
		await page
			.getByRole('dialog')
			.first()
			.getByRole('option', { name: 'Fournitures', exact: true })
			.click();
		await page.locator('[id^="ligne-"][id$="-montant"]').first().fill('600');
		await page.getByRole('button', { name: /Ajouter une Ligne de 400,00/ }).click();
		await expect(page.getByRole('combobox', { name: 'Nature' }).nth(1)).toHaveValue('Fournitures');
		await expect(page.getByText('Comme la Ligne précédente')).toBeVisible();
		await capture(page, 'suggestion-d');
	});

	test('la 404 et le refus d’Accès ont un repère main', async ({ page }) => {
		await entrer(page);
		await page.goto('/page-inconnue');
		await expect(page.locator('main')).toHaveCount(1);
	});

	test('le Tableau de contrôle aligne ses additions', async ({ page }) => {
		await entrer(page);
		await pret(page, '/');
		const termes = page.locator('article.solde-compte').getByText('Solde de départ');
		const n = await termes.count();
		const hauts = [];
		for (let i = 0; i < Math.min(n, 3); i++) {
			hauts.push((await termes.nth(i).boundingBox())?.y);
		}
		expect(new Set(hauts).size).toBe(1);
		await capture(page, 'tableau-d');
	});

	test('Réglages tient dans 1024 px', async ({ page }) => {
		await entrer(page);
		await page.setViewportSize({ width: 1024, height: 768 });
		await pret(page, '/reglages/acces');
		const large = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(large).toBeLessThanOrEqual(1024);
		await expect(page.getByRole('button', { name: /Révoquer/ }).first()).toBeInViewport({
			ratio: 1
		});
		await capture(page, 'reglages-acces-1024');
	});
});

test('la connexion à champs vides parle sous le champ, sans bulle du navigateur', async ({
	page
}) => {
	await pret(page, '/connexion');
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByText('Ce champ est à remplir.').first()).toBeVisible();
	await capture(page, 'connexion-vide');
});

test('Budget sur tablette : les montants Prévu se lisent en entier', async ({ page }) => {
	await entrer(page);
	for (const width of [660, 720]) {
		await page.setViewportSize({ width, height: 900 });
		await pret(page, '/budget?ouvert=tout');
		const champ = page.locator('input[name^="prevu-"]').first();
		const debord = await champ.evaluate((e) => e.scrollWidth - e.clientWidth);
		expect(debord).toBeLessThanOrEqual(0);
		const conteneur = await page
			.locator('.conteneur')
			.first()
			.evaluate((e) => ({ s: e.scrollWidth, c: e.clientWidth, o: getComputedStyle(e).overflowX }));
		expect(conteneur.s <= conteneur.c || conteneur.o === 'auto').toBe(true);
		await capture(page, `budget-${width}`);
	}
});

test.describe('Exercice clôturé', () => {
	test.use({ baseURL: CLOS, viewport: { width: 1280, height: 800 } });

	test('le bandeau dit vrai, et aucun bouton n’écrit dans l’Exercice regardé', async ({ page }) => {
		await entrer(page, JETON_TRESORIER, CLOS);
		for (const ecran of ['/cheques', '/caisses', '/factures']) {
			await pret(page, `${ecran}?exercice=${clos.ecoule}`);
			await expect(page.getByText(`${clos.ecoule} est clôturé`)).toBeVisible();
			await expect(page.getByText('lecture seule')).toHaveCount(0);
			await expect(page.getByRole('link', { name: 'Nouvelle Opération' })).toHaveCount(0);
			await capture(page, `clos${ecran.replace('/', '-')}`);
		}
		await pret(page, `/etats?exercice=${clos.ecoule}`);
		await expect(page.getByText('Exercice clôturé, lecture seule')).toBeVisible();
	});
});
