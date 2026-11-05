/**
 * Vérification UX du jalon 1 (story 6.8), sur le serveur construit et le jeu fictif complet.
 * Toujours : console sans erreur sur chaque écran, états provoqués, parcours au clavier seul.
 * Avec `CAPTURES=<dossier>` : chaque écran à 1280, 800 et 320 px, en clair et en sombre.
 */
import { execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { chargerDansDossier, COMPTES_FICTIFS, type JeuCharge } from '../jeux/charger.ts';
import { toucheLiens } from './aides.ts';
import { demarrerServeur as demarrer, envServeur } from './aides-instance.ts';
import { panneau } from './aides-operations.ts';

const PORT = 4178;
const PORT_NEUF = 4179;
const ORIGINE = `http://localhost:${PORT}`;
const ORIGINE_NEUVE = `http://localhost:${PORT_NEUF}`;
const NEUVE = { identifiant: 'alex', motDePasse: 'le cahier passe de main' };
const captures = process.env.CAPTURES;
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ timeout: captures ? 600_000 : 60_000 });

const FORMATS = [
	{ nom: '1280', width: 1280, height: 800 },
	{ nom: '800', width: 800, height: 900 },
	{ nom: '320', width: 320, height: 640 }
];
const THEMES = [
	['clair', 'light'],
	['sombre', 'dark']
] as const;

let dossier: string;
let dossierNeuf: string;
let serveur: ChildProcess;
let serveurNeuf: ChildProcess;
let jeu: JeuCharge;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-ux-'));
	dossierNeuf = mkdtempSync(join(tmpdir(), 'ape-compta-ux-neuve-'));
	jeu = chargerDansDossier(dossier);
	serveur = await demarrer(dossier, PORT);
	serveurNeuf = await demarrer(dossierNeuf, PORT_NEUF);
});

test.afterAll(() => {
	serveur.kill();
	serveurNeuf.kill();
	rmSync(dossier, { recursive: true, force: true });
	rmSync(dossierNeuf, { recursive: true, force: true });
});

async function connecter(page: Page, a: { identifiant: string; motDePasse: string }, origine = '') {
	await page.goto(`${origine}/connexion`);
	await page.getByLabel('Identifiant').fill(a.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(a.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);
}

/** La console reste sans erreur : `sortie()` échoue sinon, en nommant l'écran. */
function surveiller(page: Page) {
	const erreurs: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') erreurs.push(`${page.url()} : ${m.text()}`);
	});
	page.on('pageerror', (e) => erreurs.push(`${page.url()} : ${String(e)}`));
	return erreurs;
}

const ecrans = (j: JeuCharge): [string, string][] => [
	['tableau', '/'],
	['operations', '/operations'],
	['panneau', '/operations?op=1'],
	['panneau-nouvelle', '/operations?op=nouvelle'],
	['pointage', `/pointage/${j.banque}`],
	['creances-dettes', '/creances-dettes'],
	['pieces', '/pieces'],
	['pieces-toutes', '/pieces/toutes'],
	['actions', '/actions'],
	['action', `/actions/${j.kermesse}`],
	['etats', '/etats'],
	['tresorerie', '/etats/tresorerie'],
	['document-ag', '/etats/document-ag'],
	['cloture', `/reglages/exercices/${j.exercice.courant}/cloture`],
	['reglages', '/reglages'],
	['comptes', '/reglages/comptes'],
	['acces', '/reglages/acces'],
	['exercices', '/reglages/exercices'],
	['sauvegardes', '/reglages/sauvegardes'],
	['restauration', '/reglages/sauvegardes/restauration'],
	['a-propos', '/reglages/a-propos'],
	['journal', '/journal'],
	['aide', '/aide']
];

async function photographier(page: Page, nom: string, url: string, origine = ORIGINE) {
	if (!captures || !filtre.test(nom)) return;
	mkdirSync(captures, { recursive: true });
	for (const f of FORMATS) {
		await page.setViewportSize({ width: f.width, height: f.height });
		for (const [theme, schema] of THEMES) {
			await page.emulateMedia({ colorScheme: schema, reducedMotion: 'reduce' });
			await page.goto(`${origine}${url}`);
			await page.waitForLoadState('networkidle');
			await page.screenshot({
				path: join(captures, `${nom}-${f.nom}-${theme}.png`),
				fullPage: true
			});
		}
	}
}

test('chaque écran du jeu complet garde la console sans erreur', async ({ page }) => {
	test.setTimeout(captures ? 900_000 : 90_000);
	const erreurs = surveiller(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await photographier(page, 'connexion', '/connexion');
	await connecter(page, COMPTES_FICTIFS.tresorier);
	for (const [nom, url] of ecrans(jeu)) {
		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await photographier(page, nom, url);
	}
	expect(erreurs).toEqual([]);
});

test('l’assistant et les états vides d’une instance neuve disent le texte prévu', async ({
	page
}) => {
	test.setTimeout(captures ? 900_000 : 60_000);
	const erreurs = surveiller(page);
	const lien = execFileSync('node', ['build/cli/ape.js', 'lien-initial'], {
		env: envServeur(dossierNeuf, PORT_NEUF),
		encoding: 'utf8'
	}).trim();
	await page.goto(lien);
	await page.getByLabel('Identifiant').fill(NEUVE.identifiant);
	await page.getByLabel('Nom affiché').fill('Alex Fictif');
	await page.getByLabel('Mot de passe').fill(NEUVE.motDePasse);
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await page.waitForURL(/bienvenue|\/$/);

	await page.goto(`${ORIGINE_NEUVE}/`);
	await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
	await expect(
		page.getByText('Commençons par vos Comptes et leurs soldes de départ.')
	).toBeVisible();
	await photographier(page, 'tableau-neuf', '/', ORIGINE_NEUVE);

	await page.goto(`${ORIGINE_NEUVE}/bienvenue`);
	await photographier(page, 'assistant-1', '/bienvenue?etape=1', ORIGINE_NEUVE);
	await page.goto(`${ORIGINE_NEUVE}/bienvenue`);
	await page.getByLabel('Nom de l’APE').fill('APE des Tilleuls');
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByText('au 1er septembre 2026')).toBeVisible();
	await photographier(page, 'assistant-2', '/bienvenue?etape=2', ORIGINE_NEUVE);
	await page.goto(`${ORIGINE_NEUVE}/bienvenue?etape=2`);
	await page.locator('#solde-0').fill('1000');
	await page.locator('#solde-1').fill('0');
	await page.locator('#solde-2').fill('0');
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Natures et Actions');
	await photographier(page, 'assistant-3', '/bienvenue?etape=3', ORIGINE_NEUVE);
	await page.goto(`${ORIGINE_NEUVE}/bienvenue?etape=3`);
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vos sommes en cours');
	await photographier(page, 'assistant-4', '/bienvenue?etape=4', ORIGINE_NEUVE);
	await page.goto(`${ORIGINE_NEUVE}/bienvenue?etape=4`);
	await page.getByRole('button', { name: 'Passer cette étape' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre cahier est prêt.');

	const vides: [string, string, string, string][] = [
		[
			'vide-operations',
			'/operations',
			'Pas encore d’Opération',
			'Saisissez-en une, ou partez de votre relevé : c’est plus rapide.'
		],
		[
			'vide-recherche',
			'/operations?q=introuvable',
			'Rien ne correspond',
			'Essayez avec moins de critères. Un montant se cherche aussi dans les Lignes.'
		],
		[
			'vide-creances',
			'/creances-dettes',
			'Rien en attente',
			'Personne ne doit rien à l’APE, et l’APE ne doit rien à personne.'
		],
		['vide-pieces', '/pieces', 'Aucune Pièce ne manque', 'Chaque dépense a sa Pièce.']
	];
	for (const [nom, url, titre, phrase] of vides) {
		await page.goto(`${ORIGINE_NEUVE}${url}`);
		await expect(page.getByRole('heading', { name: titre })).toBeVisible();
		await expect(page.getByText(phrase)).toBeVisible();
		await photographier(page, nom, url, ORIGINE_NEUVE);
	}
	await page.goto(`${ORIGINE_NEUVE}/pointage`);
	await expect(page.getByRole('heading', { name: 'Aucun relevé pour ce Compte' })).toBeVisible();
	await photographier(page, 'vide-pointage', '/pointage', ORIGINE_NEUVE);
	expect(erreurs).toEqual([]);
});

function base() {
	return new Database(join(dossier, 'base.sqlite'));
}

test('bandeaux de sauvegarde et de version au Tableau de contrôle', async ({ page }) => {
	const b = base();
	b.prepare(
		`INSERT INTO sauvegarde_execution (debut_le, fin_le, statut, hors_vps, message)
		 VALUES (?, ?, 'echouee', 1, 'dépôt injoignable')`
	).run(new Date().toISOString(), new Date().toISOString());
	b.prepare(
		`INSERT OR REPLACE INTO version_disponible (id, derniere_version, verifie_le) VALUES (1, '99.0.0', ?)`
	).run(new Date().toISOString());
	b.close();
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.goto('/');
	await expect(page.getByText('La sauvegarde de cette nuit a échoué.')).toBeVisible();
	await expect(page.getByText('Une version plus récente est disponible')).toBeVisible();
	await photographier(page, 'bandeaux', '/');
	await photographier(page, 'sauvegardes-echec', '/reglages/sauvegardes');
	const c = base();
	c.exec('DELETE FROM sauvegarde_execution; DELETE FROM version_disponible;');
	c.close();
});

test('page introuvable et Accès refusé : le texte prévu', async ({ page }) => {
	const erreurs = surveiller(page);
	await connecter(page, COMPTES_FICTIFS.lecteur);
	await page.goto('/pointage');
	await expect(
		page.getByText(
			'Votre Accès ne permet pas de voir cette page. Demandez à la personne qui tient la trésorerie si vous en avez besoin.'
		)
	).toBeVisible();
	await photographier(page, 'acces-refuse', '/pointage');
	await page.goto('/page-inconnue');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await photographier(page, 'page-introuvable', '/page-inconnue');
	// Un refus 403 ou 404 se note en console par le navigateur lui-même : c'est la réponse attendue.
	expect(erreurs.filter((e) => !/status of 40[34]/.test(e))).toEqual([]);
});

test('erreur de saisie : le message sous le champ, en sortie de champ', async ({ page }) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.goto('/operations?op=nouvelle');
	const champ = panneau(page).getByLabel('Montant', { exact: true });
	await champ.fill('abc');
	await champ.blur();
	await expect(panneau(page).getByText('Ce montant n’est pas lisible.')).toBeVisible();
});

test('coupure réseau pendant une saisie : bandeau, saisie gardée, Réessayer', async ({ page }) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/operations?op=nouvelle');
	const d = panneau(page);
	await d.getByLabel('Montant', { exact: true }).fill('11');
	await d.getByLabel('Date').fill('2026-11-05');
	await d.getByLabel('Libellé').fill('Saisie en coupure');
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.fill('Fournitures');
	await nature.press('Enter');
	await page.route('**/api/operations', (r) => r.abort('internetdisconnected'));
	await d.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(d.getByRole('alert')).toContainText(
		'Pas de réseau pour l’instant. Votre saisie reste sur cet écran.'
	);
	await expect(d.getByLabel('Libellé')).toHaveValue('Saisie en coupure');
	if (captures) {
		await page.screenshot({ path: join(captures, 'coupure-reseau-1280.png') });
	}
	await page.unroute('**/api/operations');
	await d.getByRole('button', { name: 'Réessayer' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('session expirée : la saisie reste, la reconnexion se fait sur place', async ({ page }) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/operations?op=nouvelle');
	const d = panneau(page);
	await d.getByLabel('Montant', { exact: true }).fill('7');
	await d.getByLabel('Date').fill('2026-11-05');
	await d.getByLabel('Libellé').fill('Saisie après expiration');
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.fill('Fournitures');
	await nature.press('Enter');
	const b = base();
	b.exec('DELETE FROM session_connexion');
	b.close();
	await d.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(
		page.getByText(
			'Votre session a expiré par sécurité. Reconnectez-vous : votre saisie est conservée.'
		)
	).toBeVisible();
	if (captures) {
		await page.screenshot({ path: join(captures, 'session-expiree-1280.png') });
	}
	await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES_FICTIFS.tresorier.motDePasse);
	await page.getByRole('button', { name: /Reconnecter|Se reconnecter|Continuer/ }).click();
	await expect(d.getByLabel('Libellé')).toHaveValue('Saisie après expiration');
});

test('chargement lent : le squelette paraît après 300 ms', async ({ page }) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.route('**/__data.json*', async (r) => {
		await new Promise((f) => setTimeout(f, 1200));
		await r.continue();
	});
	await page.getByRole('link', { name: 'Journal' }).click();
	await expect(page.locator('[data-squelette], .squelette').first()).toBeVisible();
	if (captures) await page.screenshot({ path: join(captures, 'chargement-1280.png') });
	await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
});

test('UJ-1 au clavier seul : focus visible, ordre de tabulation, raccourcis', async ({
	page,
	browserName
}) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	// Le premier arrêt est le lien d'évitement, visible au focus.
	await page.keyboard.press(toucheLiens(browserName));
	const evitement = page.getByRole('link', { name: 'Aller au contenu' });
	await expect(evitement).toBeFocused();
	await expect(evitement).toBeInViewport();

	// `n` ouvre le panneau, Échap le ferme et rend le focus.
	await page.keyboard.press('Escape');
	await page.keyboard.press('n');
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Ctrl+K ouvre la palette, et elle mène au Pointage sans la souris.
	await page.keyboard.press('Control+k');
	await page.keyboard.type('Pointage');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/pointage/);
	await expect(page.locator('[data-ligne]:focus')).toHaveCount(1);

	// Chaque élément tabulable du Pointage porte un contour de focus.
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press(toucheLiens(browserName));
		const contour = await page.evaluate(() => {
			const s = getComputedStyle(document.activeElement as Element);
			return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
		});
		expect(contour, `arrêt ${i + 1} sans contour de focus`).toBe(true);
	}
});

test('UJ-4 au clavier seul : la première Opération s’enregistre sans la souris', async ({
	page
}) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('n');
	const d = panneau(page);
	await expect(d).toBeVisible();
	await d.getByLabel('Montant', { exact: true }).focus();
	await page.keyboard.type('15,20');
	// Le champ natif suit la langue du système : en headless, l'ordre des jours et des mois varie.
	await d.getByLabel('Date').fill('2026-11-05');
	await d.getByLabel('Libellé').focus();
	await page.keyboard.type('Enveloppes au clavier');
	await d.getByRole('combobox', { name: 'Nature de la ligne 1' }).focus();
	await page.keyboard.type('Fournitures');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Control+Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.goto('/operations');
	await expect(page.getByRole('main')).toContainText('Enveloppes au clavier');
});

test('arbre d’accessibilité : un h1, un titre unique, des repères sur chaque écran', async ({
	page
}) => {
	test.setTimeout(90_000);
	await connecter(page, COMPTES_FICTIFS.tresorier);
	const titres = new Map<string, string>();
	const groupes = [...new Set(ecrans(jeu).map(([, url]) => url.split('?')[0] as string))];
	for (const url of groupes) {
		await page.goto(url);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('h1'), url).toHaveCount(1);
		await expect(page.locator('main')).toHaveCount(1);
		await expect(page.locator('nav').first()).toBeVisible();
		const titre = await page.title();
		expect(titres.get(titre), `${url} : ${titre}`).toBeUndefined();
		titres.set(titre, url);
	}
});
