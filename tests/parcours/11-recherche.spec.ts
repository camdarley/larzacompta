import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { axeSansViolation, connecter, sansDefilementHorizontal } from './aides.ts';
import { operationId, panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

const compteur = (page: Page) => page.getByRole('status').filter({ hasText: 'Opération' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

test('2.4 : chaque rangée montre tout, se clique, et son libellé est un vrai lien', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations');
	await expect(page.locator('thead th')).toHaveText([
		'Date',
		'Libellé',
		'Compte',
		'Natures et Actions',
		'Pièces',
		'État',
		'Montant'
	]);
	const rangee = page.getByRole('row', { name: /Autocars du Sud/ });
	await expect(rangee).toContainText('10/10/2027');
	await expect(rangee).toContainText('Compte courant');
	await expect(rangee).toContainText('Trajets');
	await expect(rangee).toContainText('3 Actions');
	await expect(rangee).toContainText('À pointer');
	await expect(rangee).toContainText(/−.1.000,00.€/);
	await axeSansViolation(page);

	// Le lien, pour le clavier.
	const lien = rangee.getByRole('link', { name: 'Autocars du Sud' });
	await lien.focus();
	await lien.press('Enter');
	await expect(page).toHaveURL(/op=\d+/);
	await expect(panneau(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).not.toHaveURL(/op=/);
	await expect(lien).toBeFocused();

	// Toute la rangée, pour la souris.
	await rangee.locator('td').first().click();
	await expect(page).toHaveURL(/op=\d+/);
});

test('2.4 : un montant se trouve aussi dans une Ligne, et le dit', async ({ page }) => {
	await page.goto('/operations', { waitUntil: 'networkidle' });
	await page.getByLabel('Chercher une Opération').fill('250');
	await expect(page).toHaveURL(/q=250/);
	await expect(page.getByRole('main')).toContainText(
		/Ligne de 250,00.€ dans Autocars du Sud, 1.000,00.€/
	);
	await expect(compteur(page)).toContainText('1 Opération');
	await axeSansViolation(page);
});

test('2.4 : les filtres se combinent, survivent au rechargement, s’effacent', async ({ page }) => {
	await page.goto('/operations', { waitUntil: 'networkidle' });
	await page.getByLabel('Pièce').selectOption('sans');
	await expect(page).toHaveURL(/piece=sans/);
	await page.locator('#filtre-nature').selectOption({ label: 'Papeterie' });
	await expect(page).toHaveURL(/nature=\d+/);
	await page.getByLabel('Du', { exact: true }).fill('2027-10-06');
	await expect(page).toHaveURL(/du=2027-10-06/);
	await expect(compteur(page)).toContainText('1 Opération');
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.locator('tbody')).toContainText('Colle fictive');

	const adresse = page.url();
	await page.reload();
	expect(page.url()).toBe(adresse);
	await expect(page.locator('tbody tr')).toHaveCount(1);
	await expect(page.locator('#filtre-nature')).toHaveValue(/\d+/);

	await page.getByRole('link', { name: 'Tout effacer' }).click();
	await expect(page).not.toHaveURL(/nature=/);
	await expect(page.locator('tbody tr').first()).toBeVisible();
	await expect(compteur(page)).toContainText(/\d Opérations/);
});

test('2.4 : l’export suit les filtres, en CSV pour Excel français', async ({ page }) => {
	await page.goto('/operations?q=autocars');
	const attente = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Exporter en CSV' }).click();
	const fichier = await attente;
	expect(fichier.suggestedFilename()).toBe('operations-2027-2028.csv');
	const octets = readFileSync(await fichier.path());
	expect([...octets.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
	const texte = octets.toString('utf8');
	expect(texte).toContain('Date;Libellé;Compte;Nature;Action');
	expect(texte).toContain('-600,00');
	expect(texte).toContain('-1000,00');
	expect(texte).not.toContain('Colle fictive');
	expect(texte).not.toMatch(/débit|crédit|écriture|contrepartie/i);
});

test('2.4 : aucun résultat : l’état vide le dit et propose de tout effacer', async ({ page }) => {
	await page.goto('/operations?q=zzz');
	await expect(page.getByRole('heading', { name: 'Rien ne correspond' })).toBeVisible();
	await expect(
		page.getByText('Essayez avec moins de critères. Un montant se cherche aussi dans les Lignes.')
	).toBeVisible();
	await page.getByRole('main').getByRole('link', { name: 'Tout effacer' }).last().click();
	await expect(page).not.toHaveURL(/q=/);
});

test('2.4 : à 320 px, rangées à deux lignes, filtres en panneau, sans défilement', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/operations');
	await axeSansViolation(page);
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await expect(
		page.getByRole('main').getByRole('link', { name: 'Nouvelle Opération' })
	).toBeVisible();
	await page.getByRole('link', { name: 'Filtres' }).click();
	await expect(page).toHaveURL(/filtres=1/);
	await page.getByRole('dialog').getByLabel('Pièce').selectOption('sans');
	await expect(page).toHaveURL(/piece=sans/);
	await axeSansViolation(page);
	await page.keyboard.press('Escape');
	await expect(page).not.toHaveURL(/filtres=/);
	await expect(page).toHaveURL(/piece=sans/);
});

test('2.4 : le lien d’une Opération se partage', async ({ page }) => {
	const id = operationId('Autocars du Sud');
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page)).toBeVisible();
	await page.reload();
	await expect(panneau(page)).toBeVisible();
});
