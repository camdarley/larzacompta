/**
 * UJ-2 de bout en bout, à 390 px : de Mes caisses à la Recette d'espèces dans l'Action, avec un
 * Écart de caisse de 0,40 €, un transfert après le Comptage final et un test axe par écran.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { JETONS, preparerCaisses } from './aides-caisses.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4186;
const ORIGINE = `http://localhost:${PORT}`;
const TELEPHONE = { width: 390, height: 780 };

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;
let jeu: ReturnType<typeof preparerCaisses>;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-caisses-'));
	jeu = preparerCaisses(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function connecte(page: Page, role: keyof typeof JETONS) {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

const quantite = (page: Page, nom: string) => page.getByRole('textbox', { name: nom, exact: true });
const plus = (page: Page, nom: string) => page.getByRole('button', { name: `Ajouter : ${nom}` });
const enregistrer = (page: Page) => page.getByRole('button', { name: 'Enregistrer le Comptage' });
const NBSP = /[   ]/;
const euros = (texte: string) => new RegExp(texte.replaceAll(' €', `${NBSP.source}€`));

async function ecran(page: Page) {
	await axeSansViolation(page);
	expect(await sansDefilementHorizontal(page)).toBe(true);
}

async function capturer(
	navigateur: Browser,
	role: keyof typeof JETONS,
	nom: string,
	chemin: string
) {
	const sortie = process.env.CAPTURES;
	if (!sortie) return;
	mkdirSync(sortie, { recursive: true });
	for (const [format, viewport] of [
		['telephone', TELEPHONE],
		['ordinateur', { width: 1280, height: 800 }]
	] as const) {
		for (const colorScheme of ['light', 'dark'] as const) {
			const contexte = await navigateur.newContext({
				viewport,
				colorScheme,
				locale: 'fr-FR',
				timezoneId: 'Europe/Paris',
				extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
			});
			const page = await contexte.newPage();
			await connecte(page, role);
			await page.goto(`${ORIGINE}${chemin}`, { waitUntil: 'networkidle' });
			await page.screenshot({
				path: join(sortie, `${nom}-${format}-${colorScheme}.png`),
				fullPage: true
			});
			await contexte.close();
		}
	}
}

test.describe('UJ-2 : Sam compte la deuxième caisse de la Kermesse', () => {
	test('Mes caisses : une seule caisse, aucun chiffre, ni barre ni sélecteur', async ({ page }) => {
		await page.setViewportSize(TELEPHONE);
		await connecte(page, 'compteur');
		await page.goto('/');
		await expect(page).toHaveURL(/\/mes-caisses$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes caisses');
		const rangee = page.getByRole('listitem').filter({ hasText: 'Caisse 2' });
		await expect(rangee).toContainText('Fermée');
		await expect(page.getByRole('main')).not.toContainText('€');
		await expect(page.getByRole('main')).not.toContainText('Caisse 1');
		await expect(page.getByRole('link', { name: 'Aide' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
		await expect(page.getByRole('navigation')).toHaveCount(0);
		await expect(page.getByLabel('Exercice')).toHaveCount(0);
		await ecran(page);
	});

	test('tout autre écran lui est refusé, par la page comme par l’API', async ({
		page,
		request
	}) => {
		await connecte(page, 'compteur');
		for (const chemin of [
			'/caisses',
			`/caisses/${jeu.caisse2}`,
			'/operations',
			'/journal',
			'/pieces',
			'/etats',
			'/reglages',
			'/sessions/1',
			`/caisses/${jeu.caisse1}/comptage`
		]) {
			const r = await page.goto(chemin);
			expect(r?.status(), chemin).toBe(403);
		}
		const cookies = await page.context().cookies();
		const entetes = {
			cookie: `ape_session=${cookies.find((c) => c.name === 'ape_session')?.value}`,
			origin: ORIGINE,
			'x-forwarded-proto': 'http'
		};
		const hors = await request.post(`/api/caisses/${jeu.caisse1}/comptage`, {
			headers: entetes,
			data: { coupures: [], date: jeu.aujourdhui, actionId: null }
		});
		expect(hors.status()).toBe(403);
		expect((await request.post('/api/operations', { headers: entetes, data: {} })).status()).toBe(
			403
		);
	});

	test('ouvre sa caisse : Comptage prérempli, une pièce corrigée, 0,40 € confirmés', async ({
		page
	}) => {
		await page.setViewportSize(TELEPHONE);
		await connecte(page, 'compteur');
		await page.goto('/mes-caisses');
		await page.getByRole('link', { name: 'Ouvrir' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Caisse 2 · Ouverture');
		await expect(page.getByText('Repris du dernier Comptage.')).toBeVisible();
		await expect(page.getByLabel('Action')).toHaveValue(String(jeu.kermesse));
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('150,00 €'));
		await ecran(page);

		// Sam retire 40 centimes : le brouillon et le total suivent.
		const pieces = quantite(page, 'Pièces de 0,50 €');
		await pieces.fill('');
		await pieces.fill('3');
		await quantite(page, 'Pièces de 0,10 €').fill('1');
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('149,60 €'));
		await page.reload();
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('149,60 €'));

		await enregistrer(page).click();
		await expect(page.getByRole('heading', { name: 'Recomptez une fois' })).toBeVisible();
		await expect(
			page.getByText(
				euros(
					'Vous avez compté 0,40 € de moins que la dernière clôture. Ça arrive. Recomptez une fois pour vérifier.'
				)
			)
		).toBeVisible();
		await expect(quantite(page, 'Pièces de 0,50 €')).toHaveValue('3');
		await ecran(page);

		await enregistrer(page).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			euros('Comptage enregistré. Caisse 2, 149,60 €.')
		);
		await expect(page.getByText(euros('La différence de 0,40 € est confirmée.'))).toBeVisible();
		await ecran(page);
		await page.getByRole('link', { name: 'Retour à Mes caisses' }).click();
		await expect(page.getByRole('listitem').filter({ hasText: 'Caisse 2' })).toContainText(
			'Ouverte, Kermesse'
		);
	});

	test('sans réseau : rien n’est enregistré, le Comptage reste, Réessayer aboutit', async ({
		page,
		context
	}) => {
		await page.setViewportSize(TELEPHONE);
		await connecte(page, 'compteur');
		await page.goto('/mes-caisses');
		await page.getByRole('link', { name: 'Compter', exact: true }).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Comptage final');
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('0,00 €'));
		await expect(page.getByRole('main')).not.toContainText(/recette|attendu/i);

		// Tabulation : d'une quantité à l'autre, jamais par + et −.
		await quantite(page, 'Billets de 100,00 €').focus();
		await page.keyboard.press('Tab');
		await expect(quantite(page, 'Billets de 50,00 €')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(quantite(page, 'Billets de 20,00 €')).toBeFocused();

		await quantite(page, 'Billets de 100,00 €').fill('4');
		for (let i = 0; i < 2; i++) await plus(page, 'Billets de 5,00 €').click();
		await quantite(page, 'Pièces de 2,00 €').fill('1');
		await plus(page, 'Pièces de 0,50 €').click();
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('412,50 €'));

		await context.setOffline(true);
		await enregistrer(page).click();
		await expect(page.getByRole('alert')).toContainText('Rien n’est enregistré');
		await expect(page.getByRole('alert')).toContainText('Notez le total sur papier');
		await ecran(page);
		await context.setOffline(false);
		await page.getByRole('button', { name: 'Réessayer' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			euros('Comptage enregistré. Caisse 2, 412,50 €.')
		);
		await expect(page.getByRole('main')).toContainText(euros('4 × 100,00 €'));

		await page.getByRole('link', { name: 'Retour à Mes caisses' }).click();
		await expect(page.getByRole('link', { name: 'Corriger' })).toBeVisible();
	});

	test('Camille complète, et la recette entre dans la Kermesse sans ressaisie', async ({
		page
	}) => {
		await page.setViewportSize(TELEPHONE);
		await connecte(page, 'tresorier');
		await page.goto('/caisses');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caisses');
		await expect(page.getByLabel('Total des espèces')).toContainText(euros('992,50 €'));
		await ecran(page);

		await page.getByRole('link', { name: 'Voir la Session' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Session de Caisse 2');
		await ecran(page);

		// Une dépense réglée dans la journée : Non par défaut, elle entre dans le calcul.
		await page.getByRole('link', { name: 'Ajouter une dépense en espèces' }).click();
		const panneau = page.getByRole('dialog');
		await expect(panneau.getByRole('radio', { name: 'Non' })).toBeChecked();
		await panneau.getByLabel('Montant', { exact: true }).fill('35');
		await panneau.getByLabel('Libellé').fill('Glaçons fictifs');
		await panneau.getByRole('combobox', { name: 'Nature de la ligne 1' }).click();
		await panneau.getByRole('combobox', { name: 'Nature de la ligne 1' }).fill('Buvette');
		await panneau.getByRole('option', { name: 'Buvette', exact: true }).click();
		await expect(panneau.getByLabel('Paiement')).toHaveValue('especes');
		await expect(panneau.getByRole('combobox', { name: 'Compte' })).toHaveValue('Caisse 2');
		await panneau.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
		await panneau.waitFor({ state: 'detached' });

		// Un transfert vers la réserve, fait après le Comptage : Oui par défaut, il reste dehors.
		await page.getByRole('link', { name: 'Transférer' }).click();
		await expect(panneau.getByRole('radio', { name: 'Oui' })).toBeChecked();
		await panneau.getByRole('combobox', { name: 'Vers' }).click();
		await panneau.getByRole('combobox', { name: 'Vers' }).fill('Réserve');
		await panneau.getByRole('option', { name: 'Réserve', exact: true }).click();
		await panneau.getByLabel('Montant', { exact: true }).fill('100');
		await panneau.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
		await panneau.waitFor({ state: 'detached' });

		await expect(page.getByRole('heading', { name: 'Après le Comptage' })).toBeVisible();
		const calcul = page.getByRole('img', { name: /Comptage final/ });
		await expect(calcul).toContainText(euros('297,90 €'));
		await ecran(page);

		await page.getByRole('button', { name: 'Clôturer la Session' }).click();
		await expect(page.getByRole('dialog')).toContainText(
			euros('La Recette d’espèces de 297,90 € sera enregistrée pour la Kermesse.')
		);
		await ecran(page);
		await page.getByRole('dialog').getByRole('button', { name: 'Clôturer la Session' }).click();
		await expect(page.getByRole('button', { name: 'Clôturer la Session' })).toHaveCount(0);

		await page.goto(`/actions/${jeu.kermesse}`);
		await expect(page.getByRole('main')).toContainText(euros('297,90 €'));
		await expect(page.getByRole('heading', { name: 'Sessions de caisse' })).toBeVisible();
		await ecran(page);
	});

	test('l’Écart de caisse enregistré ne fausse pas le Tableau de contrôle', async ({ page }) => {
		await page.setViewportSize(TELEPHONE);
		await connecte(page, 'tresorier');
		await page.goto('/');
		const caisse = page.getByRole('article').filter({ hasText: 'Caisse 2' });
		await expect(caisse).toContainText('Égal au comptage');
		await expect(caisse.getByRole('link', { name: 'Caisse 2' })).toHaveAttribute(
			'href',
			`/caisses/${jeu.caisse2}`
		);
		await expect(caisse.getByRole('textbox')).toHaveCount(0);
		await expect(
			page.getByRole('link', { name: /Sessions de caisse non clôturées/ })
		).toContainText('Rien à faire');
		await page.goto(`/caisses/${jeu.caisse2}`);
		await expect(page.getByRole('main')).toContainText('Écart de caisse');
		await expect(page.getByRole('main')).toContainText('Recette d’espèces');
		await ecran(page);
	});

	test('Rouvrir : la recette s’annule, et la clôture suivante la recalcule', async ({ page }) => {
		await connecte(page, 'tresorier');
		await page.goto('/sessions/2');
		await page.getByRole('button', { name: 'Actions de la Session' }).click();
		await page.getByRole('button', { name: 'Rouvrir' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Rouvrir' }).click();
		await expect(page.getByRole('button', { name: 'Clôturer la Session' })).toBeVisible();
		await page.goto('/sessions/1');
		await expect(page.getByRole('button', { name: 'Actions de la Session' })).toHaveCount(0);
		await page.goto('/sessions/2');
		await page.getByRole('button', { name: 'Clôturer la Session' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Clôturer la Session' }).click();
		await expect(page.getByRole('button', { name: 'Clôturer la Session' })).toHaveCount(0);
	});
});

test.describe('Caisse de réserve', () => {
	test('se compte sans Session, écran centré sur ordinateur', async ({ page }) => {
		await connecte(page, 'tresorier');
		await page.goto('/caisses');
		await page.getByRole('link', { name: 'Compter maintenant' }).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Réserve · Comptage');
		await expect(page.getByLabel('Action')).toHaveCount(0);
		await expect(page.getByLabel('Total du Comptage')).toHaveText(euros('0,00 €'));
		const boite = await page.locator('.total-comptage').boundingBox();
		expect(boite!.x).toBeGreaterThan(300);
		await ecran(page);

		await page.getByRole('button', { name: 'Compté à un autre moment ?' }).click();
		await expect(page.getByLabel('Date du Comptage')).toHaveValue(jeu.aujourdhui);

		await quantite(page, 'Billets de 100,00 €').fill('5');
		await enregistrer(page).click();
		await expect(page.getByText(euros('100,00 € de moins que le solde attendu'))).toBeVisible();
		await enregistrer(page).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Comptage enregistré');
		await page.getByRole('link', { name: /Retour à Réserve/ }).click();
		await expect(page.getByRole('main')).toContainText('Écart de caisse');
	});
});

test.describe('Compteur au pouce', () => {
	test('à 320 px : boutons de 56 px à droite, appui long répété, jamais négatif', async ({
		page
	}) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await connecte(page, 'tresorier');
		await page.goto(`/caisses/${jeu.reserve}/comptage`, { waitUntil: 'networkidle' });
		await ecran(page);
		const moins = page.getByRole('button', { name: 'Retirer : Billets de 10,00 €' });
		const ajouter = plus(page, 'Billets de 10,00 €');
		expect(await ajouter.boundingBox()).toMatchObject({ width: 56, height: 56 });
		expect((await moins.boundingBox())!.x).toBeGreaterThan(100);
		await expect(moins).toBeDisabled();

		await ajouter.hover();
		await page.mouse.down();
		await page.waitForTimeout(900);
		await page.mouse.up();
		const q = quantite(page, 'Billets de 10,00 €');
		const tenu = Number(await q.inputValue());
		expect(tenu).toBeGreaterThan(2);
		await page.waitForTimeout(300);
		await expect(q).toHaveValue(String(tenu));

		await page.reload({ waitUntil: 'networkidle' });
		await expect(q).toHaveValue(String(tenu));
		await q.fill('-3');
		await expect(q).toHaveValue('3');
	});
});

test.describe('Lecture seule et Réglages', () => {
	test('Lecteur·rice : consulte Caisses et Session, sans rien pouvoir faire', async ({ page }) => {
		await connecte(page, 'lecteur');
		await page.goto('/caisses');
		await expect(page.getByRole('main')).toContainText('Caisse 2');
		await expect(page.getByRole('link', { name: 'Ouvrir une Session' })).toHaveCount(0);
		await page.goto('/sessions/2');
		await expect(page.getByRole('main')).toContainText('Comptage final');
		await expect(page.getByRole('button', { name: 'Clôturer la Session' })).toHaveCount(0);
		expect((await page.goto('/mes-caisses'))?.status()).toBe(403);
		expect((await page.goto(`/caisses/${jeu.caisse2}/comptage`))?.status()).toBe(403);
	});

	test('Réglages : un Accès compteur·se reçoit ses caisses et un lien à usage unique', async ({
		page
	}) => {
		await connecte(page, 'tresorier');
		await page.goto('/reglages/acces?acces=nouveau', { waitUntil: 'networkidle' });
		await page.getByLabel('Identifiant').fill('lou');
		await page.getByLabel('Nom affiché').fill('Lou Fictive');
		await page.getByLabel('Rôle').selectOption('compteur');
		await page.getByLabel('Caisse 1').check();
		await page.getByRole('button', { name: 'Créer l’Accès' }).click();
		const lien = await page.locator('code').textContent();
		expect(lien).toMatch(/\/invitation\//);
		await page.getByRole('button', { name: 'Fermer' }).last().click();
		await expect(page.getByRole('row', { name: /Lou Fictive/ })).toContainText('Caisse 1');
		await ecran(page);
	});

	test('Réglages : une caisse de réserve se crée, et l’état vide y mène', async ({ page }) => {
		await connecte(page, 'tresorier');
		await page.goto('/reglages/comptes?compte=nouveau&type=caisse', { waitUntil: 'networkidle' });
		await page.getByLabel('Nom du Compte').fill('Réserve bis');
		await page.getByLabel('Caisse de réserve').check();
		await page
			.getByRole('button', { name: /Créer|Enregistrer/ })
			.last()
			.click();
		await expect(page.getByRole('row', { name: /Réserve bis/ })).toContainText('Caisse de réserve');
	});

	test('E4 : une Session ouverte se nomme sur la page de clôture', async ({ page }) => {
		await connecte(page, 'tresorier');
		await page.goto('/caisses');
		await page.getByRole('link', { name: 'Ouvrir une Session' }).first().click();
		await page.getByLabel('Action').selectOption(String(jeu.kermesse));
		await quantite(page, 'Billets de 20,00 €').fill('4');
		await enregistrer(page).click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Comptage enregistré');
		await page.goto('/reglages/exercices');
		await page
			.getByRole('link', { name: /[Cc]lôturer/ })
			.first()
			.click();
		await expect(page.getByRole('main')).toContainText('La Session de la Caisse 1');
	});
});

test('captures', async ({ browser }) => {
	test.skip(!process.env.CAPTURES, 'Relecture à l’œil, sur demande.');
	await capturer(browser, 'compteur', 'mes-caisses', '/mes-caisses');
	await capturer(browser, 'compteur', 'aide-compteur', '/aide');
	await capturer(browser, 'tresorier', 'caisses', '/caisses');
	await capturer(browser, 'tresorier', 'caisse-detail', `/caisses/${jeu.caisse2}`);
	await capturer(browser, 'tresorier', 'caisse-reserve', `/caisses/${jeu.reserve}`);
	await capturer(browser, 'tresorier', 'session-close', '/sessions/2');
	await capturer(browser, 'tresorier', 'session-ouverte', '/sessions/3');
	await capturer(browser, 'tresorier', 'comptage-reserve', `/caisses/${jeu.reserve}/comptage`);
	await capturer(browser, 'tresorier', 'comptage-ouverture', `/caisses/${jeu.caisse2}/comptage`);
	await capturer(browser, 'tresorier', 'comptage-final', '/sessions/3/comptage');
	await capturer(browser, 'tresorier', 'tableau', '/');
	await capturer(browser, 'tresorier', 'acces', '/reglages/acces');
	await capturer(
		browser,
		'tresorier',
		'compte-caisse',
		'/reglages/comptes?compte=nouveau&type=caisse'
	);
	await capturer(
		browser,
		'tresorier',
		'depense-session',
		`/sessions/3?op=nouvelle&intention=depense&compte=${jeu.caisse1}&mode=especes`
	);
});
