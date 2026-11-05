import { expect, test } from '@playwright/test';
import { ape, axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test.describe('points de rupture', () => {
	test('barre latérale à 1280 px', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await connecter(page);
		const nav = page.getByRole('navigation', { name: 'Navigation principale' });
		await expect(nav.getByText('Tableau de contrôle')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeHidden();
		await expect(page.locator('aside').getByText('APE des Tilleuls')).toBeVisible();
		const largeur = await page
			.locator('aside')
			.first()
			.evaluate((e) => e.clientWidth);
		expect(largeur).toBe(248);
	});

	test('rail d’icônes à 800 px', async ({ page }) => {
		await page.setViewportSize({ width: 800, height: 800 });
		await connecter(page);
		const largeur = await page
			.locator('aside')
			.first()
			.evaluate((e) => e.clientWidth);
		expect(largeur).toBe(72);
		await expect(page.getByRole('link', { name: 'Journal' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeHidden();
		expect(await sansDefilementHorizontal(page)).toBe(true);
	});

	test('barre mobile à 320 px, sans défilement horizontal', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await connecter(page);
		const mobile = page.getByRole('navigation', { name: 'Navigation mobile' });
		await expect(mobile).toBeVisible();
		await expect(mobile.getByRole('link')).toHaveText(['Contrôle', 'Opérations', 'Plus']);
		await expect(page.locator('aside').first()).toBeHidden();
		// Le thème sombre passe aussi au crible des contrastes.
		await page.emulateMedia({ colorScheme: 'dark' });
		for (const chemin of [
			'/',
			'/aide',
			'/journal',
			'/plus',
			'/preferences',
			'/reglages',
			'/reglages/comptes',
			'/reglages/natures',
			'/reglages/actions',
			'/reglages/groupes',
			'/reglages/acces',
			'/reglages/exercices'
		]) {
			await page.goto(chemin);
			expect(await sansDefilementHorizontal(page), chemin).toBe(true);
			await axeSansViolation(page);
		}
	});
});

test('seules les entrées livrées apparaissent, sans entrée grisée', async ({ page }) => {
	await connecter(page);
	const liens = page.locator('aside nav a');
	await expect(liens).toHaveText([
		'Tableau de contrôle',
		'Opérations',
		'Réglages',
		'Journal',
		'Aide'
	]);
	await expect(page.getByText('bientôt', { exact: false })).toHaveCount(0);
});

test('chaque écran a un h1 et un title uniques, des repères et un lien d’évitement', async ({
	page
}) => {
	await connecter(page);
	const titres = new Set<string>();
	const chemins = [
		'/',
		'/aide',
		'/journal',
		'/preferences',
		'/reglages',
		'/reglages/comptes',
		'/reglages/natures',
		'/reglages/actions',
		'/reglages/groupes',
		'/reglages/acces',
		'/reglages/exercices'
	];
	for (const chemin of chemins) {
		await page.goto(chemin);
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByRole('main')).toBeVisible();
		await expect(page.getByRole('navigation').first()).toBeAttached();
		const titre = await page.title();
		expect(titre).toContain('APE des Tilleuls');
		titres.add(titre);
		await axeSansViolation(page);
	}
	expect(titres.size).toBe(chemins.length);

	await page.goto('/');
	await page.keyboard.press('Tab');
	const evitement = page.getByRole('link', { name: 'Aller au contenu' });
	await expect(evitement).toBeFocused();
});

test('le focus suit la navigation', async ({ page }) => {
	await connecter(page);
	await page.getByRole('link', { name: 'Journal' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Journal');
	await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
	expect(await page.title()).toBe('Journal, APE des Tilleuls');
});

test.describe('panneau', () => {
	test('vit dans l’URL, piège le focus, se ferme à Échap et rend le focus', async ({ page }) => {
		await connecter(page);
		await page.goto('/reglages/comptes');
		const lien = page.getByRole('link', { name: 'Créer un Compte' });
		await lien.focus();
		await lien.press('Enter');
		await expect(page).toHaveURL(/compte=nouveau/);
		const panneau = page.getByRole('dialog');
		await expect(panneau).toBeVisible();
		await expect(page.getByLabel('Nom du Compte')).toBeFocused();

		for (let i = 0; i < 8; i++) {
			await page.keyboard.press('Tab');
			const dedans = await page.evaluate(
				() => document.activeElement?.closest('[role=dialog]') !== null
			);
			expect(dedans).toBe(true);
		}

		await page.keyboard.press('Escape');
		await expect(panneau).toBeHidden();
		await expect(page).not.toHaveURL(/compte=/);
		await expect(lien).toBeFocused();
	});

	test('se retrouve au rechargement', async ({ page }) => {
		await connecter(page);
		await page.goto('/reglages/comptes?compte=nouveau');
		await expect(page.getByRole('dialog')).toBeVisible();
	});

	test('le bouton retour le ferme', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 780 });
		await connecter(page);
		await page.goto('/reglages/comptes');
		await page.getByRole('link', { name: 'Compte courant' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.goBack();
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(page).toHaveURL(/reglages\/comptes$/);
	});

	test('« Quitter sans enregistrer ? » protège une saisie, avec une couche de plus au maximum', async ({
		page
	}) => {
		await connecter(page);
		await page.goto('/reglages/comptes?compte=nouveau');
		await page.getByLabel('Nom du Compte').fill('Une saisie');
		await page.keyboard.press('Escape');
		const confirmation = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });
		await expect(confirmation).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(2);
		await expect(confirmation.getByRole('button', { name: 'Continuer la saisie' })).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(confirmation).toBeHidden();
		await expect(page.getByLabel('Nom du Compte')).toHaveValue('Une saisie');

		await page.getByRole('button', { name: 'Fermer' }).click();
		await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});

test('un toast confirme, puis s’efface au bout de 6 s, sauf au survol', async ({ page }) => {
	await connecter(page);
	await page.goto('/reglages');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	const toast = page.getByRole('status').getByText('Enregistré.');
	await expect(toast).toBeVisible();
	await toast.hover();
	await page.waitForTimeout(6500);
	await expect(toast).toBeVisible();
	await page.mouse.move(600, 100);
	await expect(toast).toBeHidden({ timeout: 7000 });
});

test('un écran réservé à l’ordinateur passe en consultation sur téléphone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await connecter(page);
	await page.goto('/reglages/comptes');
	await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Créer un Compte' })).toBeHidden();
	await page.goto('/reglages');
	await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
	await expect(page.getByRole('main').getByText('APE des Tilleuls')).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeHidden();
});

test('une URL interdite au rôle affiche une page calme', async ({ page, context }) => {
	const b = base();
	b.prepare(
		`INSERT OR IGNORE INTO acces (identifiant, nom_affiche, role, cree_le)
		 VALUES ('lecture', 'Dominique Fictive', 'lecteur', '2026-11-04T10:00:00.000Z')`
	).run();
	b.close();
	const lien = ape('reinitialiser-acces', 'lecture');
	await page.goto(lien);
	await page.getByLabel('Mot de passe').fill('un mot de passe de lecture');
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page).toHaveURL(/\/$/);

	const liens = page.locator('aside nav a');
	await expect(liens).toHaveText(['Tableau de contrôle', 'Opérations', 'Journal', 'Aide']);

	const reponse = await page.goto('/reglages/comptes');
	expect(reponse?.status()).toBe(403);
	await expect(page.getByText('Votre Accès ne permet pas de voir cette page.')).toBeVisible();
	await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
	await expect(page).toHaveURL(/\/$/);
	await context.clearCookies();
});

test('une page inconnue reste calme', async ({ page }) => {
	await connecter(page);
	const r = await page.goto('/ceci-n-existe-pas');
	expect(r?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cette page n’existe pas');
});

test('le manifeste porte le nom de l’APE, sans installation', async ({ request }) => {
	const m = await (await request.get('/manifest.webmanifest')).json();
	expect(m.name).toBe('APE des Tilleuls');
	expect(m.display).toBe('browser');
});

test('/sante répond sans session', async ({ request }) => {
	expect((await request.get('/sante')).status()).toBe(200);
});
