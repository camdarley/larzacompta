import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { axeSansViolation } from './aides.ts';
import { demarrerServeur } from './aides-instance.ts';
import { JETONS, preparerCaisses } from './aides-caisses.ts';

/**
 * Retour d'usage du 07/11/2026 : un simple inventaire de caisse passe par une Session, et le
 * Comptage final obligeait à tout recompter. Il reprend l'ouverture d'un geste.
 */
const PORT = 4197;
const ORIGINE = `http://localhost:${PORT}`;
test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;
let jeu: ReturnType<typeof preparerCaisses>;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-inventaire-'));
	jeu = preparerCaisses(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

const NBSP = /[\s\u00a0\u202f]/;
const euros = (texte: string) => new RegExp(texte.replaceAll(' €', `${NBSP.source}€`));

async function connecte(page: Page) {
	await page.context().addCookies([
		{
			name: 'ape_session',
			value: JETONS.tresorier,
			url: ORIGINE,
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
}

test('inventaire : le Comptage final reprend l’ouverture, la Session se clôt sans recette', async ({
	page
}) => {
	await connecte(page);
	await page.goto(`/caisses/${jeu.caisse1}/comptage`);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Ouverture');
	await page.getByRole('textbox', { name: euros('Billets de 20,00 €') }).fill('3');
	await page.getByRole('textbox', { name: euros('Pièces de 0,50 €') }).fill('1');
	const total = page.getByLabel('Total du Comptage');
	const ouverture = (await total.textContent()) ?? '';
	await page.getByLabel('Action').selectOption({ label: 'Sans Action' });
	await page.getByRole('button', { name: 'Enregistrer le Comptage' }).click();
	// Autre total que la dernière clôture : le recomptage le confirme, comme au vrai.
	const recompter = page.getByRole('heading', { name: 'Recomptez une fois' });
	const fait = page.getByRole('heading', { level: 1, name: /Comptage enregistré/ });
	await expect(recompter.or(fait)).toBeVisible();
	if (await recompter.isVisible()) {
		await page.getByRole('button', { name: 'Enregistrer le Comptage' }).click();
	}
	await expect(fait).toBeVisible();

	await page.goto(`/caisses/${jeu.caisse1}/comptage`);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Comptage final');
	await expect(total).toHaveText(euros('0,00 €'));
	const reprendre = page.getByRole('button', { name: /Reprendre le comptage d’ouverture/ });
	await expect(reprendre).toContainText(ouverture.trim());
	await axeSansViolation(page);
	await reprendre.click();
	await expect(total).toHaveText(ouverture.trim());
	await expect(page.getByText('Repris du dernier Comptage.')).toBeVisible();
	await expect(reprendre).toHaveCount(0);
	await page.getByRole('button', { name: 'Enregistrer le Comptage' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Comptage enregistré');

	await page.getByRole('link', { name: 'Retour à la Session' }).click();
	await expect(page.getByRole('img', { name: /Comptage final/ })).toBeVisible();
	await page.getByRole('button', { name: 'Clôturer la Session' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Clôturer la Session' }).click();
	await expect(page.getByRole('button', { name: 'Clôturer la Session' })).toHaveCount(0);
	await expect(page.getByRole('main')).not.toContainText('Voir l’Opération');
});

test('inventaire d’une caisse ordinaire : un seul Comptage, sans Session', async ({ page }) => {
	await connecte(page);
	await page.goto(`/caisses/${jeu.caisse1}`);
	await page.getByRole('link', { name: 'Faire l’inventaire' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Inventaire');
	await expect(page.getByLabel('Action')).toHaveCount(0);
	const reprendre = page.getByRole('button', { name: /Reprendre le comptage du/ });
	await axeSansViolation(page);
	await reprendre.click();
	await expect(page.getByText('Repris du dernier Comptage.')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer le Comptage' }).click();
	await expect(page.getByRole('heading', { level: 1, name: /Comptage enregistré/ })).toBeVisible();

	await page.goto(`/caisses/${jeu.caisse1}`);
	await expect(page.getByRole('link', { name: 'Faire l’inventaire' })).toBeVisible();
	await expect(page.getByRole('main')).not.toContainText('Session ouverte');
	await expect(page.getByRole('main')).toContainText('Comptage de contrôle');
});
