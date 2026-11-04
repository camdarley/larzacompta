import { expect, test } from '@playwright/test';
import { axeSansViolation, connecter, sansDefilementHorizontal } from './aides.ts';

test.describe.configure({ mode: 'serial' });

for (const largeur of [1280, 320]) {
	test(`connexion et accueil neuf sont accessibles à ${largeur} px`, async ({ page }) => {
		await page.setViewportSize({ width: largeur, height: 800 });
		await page.goto('/connexion');
		await axeSansViolation(page);
		expect(await sansDefilementHorizontal(page)).toBe(true);

		await connecter(page);
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue');
		await expect(
			page.getByText('Commençons par vos Comptes et leurs soldes de départ.')
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Lancer l’assistant' })).toBeVisible();
		await axeSansViolation(page);
		expect(await sansDefilementHorizontal(page)).toBe(true);
	});
}

test('Fraunces n’est jamais rendue sous 24 px, et aucun écran n’appelle un tiers', async ({
	page
}) => {
	const externes: string[] = [];
	page.on('request', (r) => {
		if (!r.url().startsWith('http://localhost')) externes.push(r.url());
	});
	await connecter(page);
	for (const chemin of ['/', '/aide', '/journal']) {
		await page.goto(chemin);
		await page.waitForLoadState('networkidle');
		const trop = await page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('body *')]
				.filter((e) => e.textContent?.trim())
				.filter((e) => {
					const s = getComputedStyle(e);
					return s.fontFamily.includes('Fraunces') && parseFloat(s.fontSize) < 24;
				})
				.map((e) => e.tagName)
		);
		expect(trop).toEqual([]);
	}
	expect(externes).toEqual([]);
});

test('le thème vient du cookie, dès le rendu serveur', async ({ page, context, request }) => {
	await connecter(page);
	const [session] = (await context.cookies()).filter((c) => c.name === 'ape_session');
	const entete = { cookie: `ape_session=${session?.value}; ape_theme=sombre` };
	const html = await (await request.get('/', { headers: entete })).text();
	expect(html).toContain('data-theme="sombre"');
	const neutre = await (await request.get('/connexion')).text();
	expect(neutre).toContain('data-theme="systeme"');
	const injecte = await (
		await request.get('/connexion', { headers: { cookie: 'ape_theme="><script>' } })
	).text();
	expect(injecte).toContain('data-theme="systeme"');
});

test('le thème sombre suit le système quand le choix est Système', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/connexion');
	const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	expect(fond).toBe('rgb(23, 21, 29)');
});

test('prefers-reduced-motion ne laisse que les transitions d’opacité', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/connexion');
	const propriete = await page.evaluate(
		() => getComputedStyle(document.querySelector('button') as Element).transitionProperty
	);
	expect(propriete).toBe('opacity');
});

test('une double soumission n’envoie qu’une fois', async ({ page }) => {
	await page.goto('/connexion');
	let envois = 0;
	await page.route('**/connexion**', async (route) => {
		if (route.request().method() === 'POST') {
			envois += 1;
			await new Promise((r) => setTimeout(r, 300));
		}
		await route.continue();
	});
	await page.getByLabel('Identifiant').fill('personne');
	await page.getByLabel('Mot de passe', { exact: true }).fill('faux mot de passe');
	const bouton = page.getByRole('button', { name: 'Se connecter' });
	await bouton.click();
	await expect(bouton).toHaveAttribute('aria-busy', 'true');
	// aria-disabled ferait attendre Playwright : le second clic part pendant l'envoi.
	await bouton.dispatchEvent('click');
	await expect(page.getByRole('alert')).toBeVisible();
	expect(envois).toBe(1);
});
