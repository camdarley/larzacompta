import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Les autres parcours envoient `x-forwarded-proto`, ce qu'un vrai navigateur ne fait jamais sans
 * proxy. Ici, aucun en-tête ajouté : c'est ce que voit une personne qui lance `pnpm local`.
 */
const PORT = 4194;
const ORIGINE = `http://localhost:${PORT}`;
test.use({ baseURL: ORIGINE, extraHTTPHeaders: {} });
test.describe.configure({ mode: 'serial' });

let dossier = '';
let serveur: ChildProcess;
let lien = '';

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-local-'));
	serveur = spawn('node', ['scripts/local.ts'], {
		stdio: ['ignore', 'pipe', 'ignore'],
		env: { ...process.env, APE_DONNEES: dossier, PORT: String(PORT), TZ: 'Europe/Paris' }
	});
	lien = await new Promise<string>((ok, ko) => {
		const delai = setTimeout(() => ko(new Error('pas de lien initial')), 20000);
		serveur.stdout?.setEncoding('utf8').on('data', (texte: string) => {
			const trouve = /\n(http:\S+\/invitation\/\S+)\n/.exec(texte)?.[1];
			if (trouve) {
				clearTimeout(delai);
				ok(trouve);
			}
		});
	});
});

test.afterAll(() => {
	serveur.kill('SIGTERM');
	rmSync(dossier, { recursive: true, force: true });
});

test('le lien initial crée l’Accès, sans en-tête de proxy, et ouvre une session', async ({
	page,
	context
}) => {
	expect(lien.startsWith(`${ORIGINE}/invitation/`)).toBe(true);
	await page.goto(lien);
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Identifiant').fill('tresorerie');
	await page.getByLabel('Nom affiché').fill('Trésorerie Fictive');
	await page.getByLabel('Mot de passe').fill('un mot de passe assez long');
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page).toHaveURL(/\/bienvenue/);
	await expect(page.getByText('Cross-site POST')).toHaveCount(0);
	const cookies = await context.cookies();
	expect(cookies.find((c) => c.name === 'ape_session')?.httpOnly).toBe(true);
	await page.reload();
	await expect(page).toHaveURL(/\/bienvenue/);
});

test('une autre origine reste refusée', async ({ request }) => {
	const r = await request.post('/connexion', {
		headers: { origin: 'https://ailleurs.example', accept: 'text/html' },
		form: { identifiant: 'x' }
	});
	expect(r.status()).toBe(403);
});

test('127.0.0.1 renvoie vers localhost, où vit le cookie', async ({ page }) => {
	await page.goto(`http://127.0.0.1:${PORT}/connexion`);
	await expect(page).toHaveURL(new RegExp(`^${ORIGINE}/`));
});
