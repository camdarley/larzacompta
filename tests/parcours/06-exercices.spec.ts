import { expect, test } from '@playwright/test';
import { axeSansViolation, connecter } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
	await page.goto('/reglages/exercices');
});

test('la Balance d’ouverture se modifie', async ({ page }) => {
	await page.getByRole('link', { name: 'Balance d’ouverture' }).click();
	const panneau = page.getByRole('dialog');
	await expect(panneau.getByLabel('Livret')).toHaveValue(/9.000,00/);
	await panneau.getByLabel('Livret').fill('9100');
	await panneau.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(panneau).toBeHidden();
	await page.goto('/reglages/comptes');
	await expect(page.getByRole('row', { name: /Livret/ })).toContainText(
		'9 100,00'.replace(' ', ' ')
	);
});

test('un repère s’ajoute avec son seul nom, sans dates', async ({ page }) => {
	await page.getByRole('link', { name: 'Ajouter un repère' }).click();
	await page.getByLabel('Nom de l’Exercice').fill('2024-2025');
	await page.getByRole('button', { name: 'Ajouter le repère' }).click();
	const ligne = page.getByRole('row', { name: /2024-2025/ });
	await expect(ligne).toContainText('Repère');
	await expect(ligne).toContainText('—');
});

test('l’Exercice suivant s’ouvre, puis le troisième est refusé', async ({ page }) => {
	await page.getByRole('button', { name: 'Ouvrir l’Exercice suivant' }).click();
	const ligne = page.getByRole('row', { name: /2027-2028/ });
	await expect(ligne).toContainText('01/09/2027');
	await expect(ligne).toContainText('31/08/2028');
	await axeSansViolation(page);

	await page.getByRole('button', { name: 'Ouvrir l’Exercice suivant' }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'Deux Exercices peuvent être ouverts, pas trois, et ils se suivent sans trou.'
	);
	await expect(page.getByRole('row', { name: /2028-2029/ })).toHaveCount(0);
});

test('le sélecteur garde l’écran et met l’URL à jour', async ({ page }) => {
	await expect(page.getByRole('button', { name: /^2027-2028 Ouvert/ })).toBeVisible();
	await page.getByRole('button', { name: /changer d’Exercice/ }).click();
	await page.getByRole('link', { name: '2026-2027' }).click();
	await expect(page).toHaveURL(/reglages\/exercices\?exercice=2026-2027/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Exercices');
	await expect(page.getByRole('button', { name: /^2026-2027 Ouvert/ })).toBeVisible();
	await page.getByRole('link', { name: 'Journal' }).click();
	await expect(page).toHaveURL(/journal\?exercice=2026-2027/);
	await expect(page.getByRole('button', { name: /^2026-2027 Ouvert/ })).toBeVisible();
});

test('à la première ouverture, le défaut est l’Exercice ouvert le plus récent', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /^2027-2028 Ouvert/ })).toBeVisible();
});
