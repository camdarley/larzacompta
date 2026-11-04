import { expect, test } from '@playwright/test';
import { ape, base, connecter, effacerTentatives, TRESORIER } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test('sans session, aucune page n’est atteignable', async ({ page }) => {
	for (const chemin of ['/', '/reglages', '/journal', '/bienvenue', '/aide', '/page-inconnue']) {
		await page.goto(chemin);
		await expect(page).toHaveURL(/\/connexion\?suite=/);
	}
});

test('la page de connexion n’appelle aucun tiers et porte une CSP par nonce', async ({ page }) => {
	const externes: string[] = [];
	page.on('request', (r) => {
		if (!r.url().startsWith('http://localhost')) externes.push(r.url());
	});
	const erreursCsp: string[] = [];
	page.on('console', (m) => {
		if (/Content Security Policy/i.test(m.text())) erreursCsp.push(m.text());
	});
	const reponse = await page.goto('/connexion');
	await page.waitForLoadState('networkidle');
	const csp = reponse?.headers()['content-security-policy'] ?? '';
	expect(csp).toMatch(/script-src 'self' 'strict-dynamic' 'nonce-/);
	expect(csp).toContain("default-src 'none'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(externes).toEqual([]);
	expect(erreursCsp).toEqual([]);
});

test('un POST JSON d’une autre origine est refusé, avec { code, details }', async ({ request }) => {
	const r = await request.post('/api/quoi-que-ce-soit', {
		headers: { origin: 'https://ailleurs.example' },
		data: {}
	});
	expect(r.status()).toBe(403);
	expect(await r.json()).toEqual({ code: 'origine_refusee', details: {} });
});

test('une action sans session répond 401, sans rediriger', async ({ request }) => {
	const r = await request.post('/reglages', {
		headers: {
			origin: 'http://localhost:4173',
			'x-sveltekit-action': 'true',
			accept: 'application/json',
			'content-type': 'application/x-www-form-urlencoded'
		},
		form: { nom: 'x' }
	});
	expect(r.status()).toBe(401);
	expect((await r.json()).code).toBe('session_expiree');
});

test('un lien inconnu reste calme', async ({ page }) => {
	await page.goto('/invitation/lien-inconnu');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lien expiré');
	await expect(page.getByRole('link', { name: 'Aller à la connexion' })).toBeVisible();
});

test('le lien initial crée l’Accès trésorier et ne sert qu’une fois', async ({ page, context }) => {
	const lien = ape('lien-initial');
	await page.goto(lien);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Créez votre Accès');

	await page.getByLabel('Identifiant').fill(TRESORIER.identifiant);
	await page.getByLabel('Nom affiché').fill(TRESORIER.nom);
	await page.getByLabel('Mot de passe').fill('court');
	await expect(page.getByText('5 sur 12 caractères')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page.getByText('12 caractères ou plus').first()).toBeVisible();
	await expect(page.getByLabel('Identifiant')).toHaveValue(TRESORIER.identifiant);

	await page.getByLabel('Mot de passe').fill(TRESORIER.motDePasse);
	await expect(page.getByText('Longueur suffisante')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page).toHaveURL(/\/bienvenue/);

	const cookie = (await context.cookies()).find((c) => c.name === 'ape_session');
	expect(cookie?.httpOnly).toBe(true);
	expect(cookie?.sameSite).toBe('Lax');
	expect(cookie?.secure).toBe(true);
	expect(Buffer.from(cookie?.value ?? '', 'base64url')).toHaveLength(32);

	const b = base();
	const a = b
		.prepare('SELECT role, hash_mot_de_passe AS h FROM acces WHERE identifiant = ?')
		.get(TRESORIER.identifiant) as { role: string; h: string };
	const sessions = b.prepare('SELECT hash_jeton FROM session_connexion').pluck().all() as string[];
	b.close();
	expect(a.role).toBe('tresorier');
	expect(a.h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
	expect(sessions).toHaveLength(1);
	expect(sessions[0]).toMatch(/^[0-9a-f]{64}$/);
	expect(sessions[0]).not.toBe(cookie?.value);

	await context.clearCookies();
	await page.goto(lien);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lien expiré');
});

test('ape lien-initial refuse une instance qui a déjà un Accès', () => {
	expect(() => ape('lien-initial')).toThrow();
});

test('la connexion ramène à l’URL demandée', async ({ page }) => {
	effacerTentatives();
	await page.goto('/journal');
	await page.getByLabel('Identifiant').fill(TRESORIER.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(TRESORIER.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).toHaveURL(/\/journal$/);
});

test('un mauvais mot de passe garde la saisie et le message prévu', async ({ page }) => {
	effacerTentatives();
	await page.goto('/connexion');
	await page.getByLabel('Identifiant').fill(TRESORIER.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais mot de passe');
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.');
	await expect(page.getByLabel('Identifiant')).toHaveValue(TRESORIER.identifiant);
});

test('« Mot de passe oublié ? » explique, sans e-mail', async ({ page }) => {
	await page.goto('/connexion');
	await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
	await expect(
		page.getByText('Il n’y a pas de récupération par e-mail. Demandez à la personne')
	).toBeVisible();
});

test('après 10 échecs, même le bon mot de passe attend', async ({ page }) => {
	effacerTentatives();
	await page.goto('/connexion');
	for (let i = 0; i < 10; i++) {
		await page.getByLabel('Identifiant').fill(TRESORIER.identifiant);
		await page.getByLabel('Mot de passe', { exact: true }).fill(`faux mot de passe ${i}`);
		await page.getByRole('button', { name: 'Se connecter' }).click();
		await expect(page.getByRole('alert')).toBeVisible();
	}
	await page.getByLabel('Mot de passe', { exact: true }).fill(TRESORIER.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByRole('alert')).toHaveText('Trop d’essais. Réessayez dans 15 minutes.');
	effacerTentatives();
});

test('ape reinitialiser-acces produit un lien de nouveau mot de passe', async ({
	page,
	context
}) => {
	const lien = ape('reinitialiser-acces', TRESORIER.identifiant);
	await page.goto(lien);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Choisissez un nouveau mot de passe'
	);
	await page.getByLabel('Mot de passe').fill(TRESORIER.motDePasse);
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page).toHaveURL(/\/$/);
	await context.clearCookies();
	await connecter(page);
});
