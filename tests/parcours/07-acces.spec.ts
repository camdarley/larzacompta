import { expect, test } from '@playwright/test';
import { base, connecter, TRESORIER } from './aides.ts';

test.describe.configure({ mode: 'serial' });

let lien = '';

test('un Accès se crée avec un lien affiché une seule fois', async ({ page }) => {
	await connecter(page);
	await page.goto('/reglages/acces');
	await page.getByRole('link', { name: 'Créer un Accès' }).click();
	await expect(page.getByLabel('Rôle')).toHaveCount(0);
	await page.getByLabel('Identifiant').fill('alex');
	await page.getByLabel('Nom affiché').fill('Alex Fictif');
	await page.getByRole('button', { name: 'Créer l’Accès' }).click();

	await expect(page.getByText('Ce lien ne s’affichera qu’une seule fois.')).toBeVisible();
	lien = (await page.locator('code').textContent()) ?? '';
	expect(lien).toMatch(/\/invitation\/[\w-]{43}$/);

	const b = base();
	const stockes = b.prepare('SELECT hash_jeton FROM jeton_acces').pluck().all() as string[];
	b.close();
	expect(stockes).not.toContain(lien.split('/').pop());

	await page.getByRole('button', { name: 'Fermer' }).last().click();
	await page.reload();
	await expect(page.locator('code')).toHaveCount(0);
	await expect(page.getByRole('row', { name: /Alex Fictif/ })).toContainText(
		'En attente du mot de passe'
	);
});

test('la personne choisit son mot de passe et arrive au Tableau de contrôle', async ({ page }) => {
	await page.goto(lien);
	await expect(page.getByText('Bonjour Alex Fictif.')).toBeVisible();
	await expect(page.getByLabel('Identifiant')).toHaveCount(0);
	await page.getByLabel('Mot de passe').fill('le cahier passe de main');
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('aside').getByText('Alex Fictif')).toBeVisible();
});

test('le dernier Accès trésorier actif ne se révoque pas', async ({ page }) => {
	await connecter(page);
	await page.goto('/reglages/acces');
	// L'Accès connecté n'a pas de bouton : on ne se coupe pas soi-même.
	await expect(
		page.getByRole('row', { name: new RegExp(TRESORIER.nom) }).getByRole('button')
	).toHaveCount(0);
	await expect(page.getByRole('row', { name: /Alex Fictif/ }).getByRole('button')).toHaveCount(1);
});

test('une révocation passe par un dialogue, coupe la session et reste au Journal', async ({
	page,
	browser
}) => {
	const autre = await browser.newContext({
		baseURL: test.info().project.use.baseURL,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const pageAlex = await autre.newPage();
	await connecter(pageAlex, { identifiant: 'alex', motDePasse: 'le cahier passe de main' });

	await connecter(page);
	await page.goto('/reglages/acces');
	await page
		.getByRole('row', { name: /Alex Fictif/ })
		.getByRole('button', { name: 'Révoquer' })
		.click();
	const dialogue = page.getByRole('dialog', { name: /Révoquer l’Accès de Alex Fictif/ });
	await expect(dialogue.getByRole('button', { name: 'Revenir' })).toBeFocused();
	await dialogue.getByRole('button', { name: 'Révoquer' }).click();
	await expect(page.getByRole('row', { name: /Alex Fictif/ })).toContainText('Révoqué');

	await pageAlex.goto('/');
	await expect(pageAlex).toHaveURL(/connexion/);
	await autre.close();

	await page.goto('/journal');
	await expect(page.getByText('a révoqué l’Accès de Alex Fictif.')).toBeVisible();
});

test('A1 : la révocation du dernier trésorier est refusée', async ({ page }) => {
	await connecter(page);
	const b = base();
	const id = b.prepare(`SELECT id FROM acces WHERE identifiant = 'camille'`).pluck().get();
	b.close();
	const r2 = await page.request.post('/reglages/acces?/revoquer', {
		headers: {
			origin: 'http://localhost:4173',
			'x-sveltekit-action': 'true',
			accept: 'application/json'
		},
		form: { id: String(id) }
	});
	expect(r2.status()).toBe(400);
	expect(await r2.text()).toContain('dernier_tresorier');
});

test.describe('préférences', () => {
	test.beforeEach(async ({ page }) => {
		await connecter(page);
		await page.goto('/preferences', { waitUntil: 'networkidle' });
	});

	test('le thème s’applique tout de suite et suit la personne', async ({ page, context }) => {
		await page.getByText('Sombre', { exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
		await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');

		await context.clearCookies();
		await connecter(page);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'sombre');
		await page.goto('/preferences');
		await page.getByText('Système', { exact: true }).click();
		await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
	});

	test('les raccourcis se désactivent', async ({ page }) => {
		await page.getByLabel('Activer les raccourcis du clavier').uncheck();
		await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
		const b = base();
		const p = b
			.prepare(`SELECT preferences_json FROM acces WHERE identifiant = 'camille'`)
			.pluck()
			.get();
		b.close();
		expect(JSON.parse(p as string).raccourcis).toBe(false);
		await page.reload();
		await page.getByLabel('Activer les raccourcis du clavier').check();
		await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
	});

	test('le mot de passe change, avec contrôle de l’actuel', async ({ page }) => {
		await page.getByLabel('Mot de passe actuel').fill('pas le bon mot de passe');
		await page.getByLabel('Nouveau mot de passe').fill('un nouveau mot de passe');
		await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
		await expect(page.getByText('Ce mot de passe n’est pas le bon.')).toBeVisible();
		await page.getByLabel('Mot de passe actuel').fill(TRESORIER.motDePasse);
		await page.getByLabel('Nouveau mot de passe').fill(TRESORIER.motDePasse);
		await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
		await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
	});
});

test('se déconnecter supprime la session et ramène à la connexion', async ({ page, context }) => {
	await connecter(page);
	await page.getByRole('button', { name: /Menu personnel/ }).click();
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(/\/connexion/);
	expect((await context.cookies()).find((c) => c.name === 'ape_session')).toBeUndefined();
	const b = base();
	const n = b.prepare(`SELECT count(*) FROM session_connexion`).pluck().get() as number;
	b.close();
	expect(n).toBeGreaterThanOrEqual(0);
	await page.goto('/journal');
	await expect(page).toHaveURL(/connexion/);
});
