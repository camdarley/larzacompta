import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

test('le tableau montre date, personne, phrase et élément, du plus récent au plus ancien', async ({
	page
}) => {
	await page.goto('/journal?type=nature');
	await expect(page.locator('thead th')).toHaveText(['Date', 'Personne', 'Action', 'Élément']);
	await expect(page.getByRole('row', { name: /a renommé la Nature/ })).toContainText(
		'Camille Fictive'
	);
	await expect(
		page.getByRole('row', { name: /a renommé la Nature/ }).getByRole('link', { name: 'Nature' })
	).toBeVisible();
	await axeSansViolation(page);
});

test('les filtres se combinent, passent par l’URL, et « Tout effacer » les retire', async ({
	page
}) => {
	await page.goto('/journal');
	const compteur = page.locator('[role=status]').filter({ hasText: /résultat/ });
	const tous = await compteur.textContent();
	await page.getByLabel('Type').selectOption({ label: 'Compte' });
	await expect(page).toHaveURL(/type=compte/);
	await expect(compteur).not.toHaveText(tous ?? '');
	await page.getByLabel('Personne', { exact: true }).selectOption({ label: 'Camille Fictive' });
	await expect(page).toHaveURL(/personne=Camille/);
	await expect(page).toHaveURL(/type=compte/);
	await expect(page.getByRole('link', { name: 'Retirer le filtre Compte' })).toBeVisible();

	await page.reload();
	await expect(page.getByLabel('Type')).toHaveValue('compte');

	await page.getByRole('link', { name: 'Tout effacer' }).click();
	await expect(page).toHaveURL(/journal$/);
	await expect(compteur).toHaveText(tous ?? '');
});

test('une période sans résultat dit de retirer des critères', async ({ page }) => {
	await page.goto('/journal?du=2001-01-01&au=2001-01-02');
	await expect(page.getByRole('heading', { name: 'Rien ne correspond' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Tout effacer' })).toBeVisible();
});

test('la pagination va par 50', async ({ page }) => {
	const b = base();
	const ajouter = b.prepare(
		`INSERT INTO journal_modification (horodatage, acces_nom, evenement, entite_type, resume)
		 VALUES ('2026-10-01T10:00:00.000Z', 'Personne fictive', 'test.ajoute', 'test', 'a ajouté une ligne d’essai.')`
	);
	for (let i = 0; i < 60; i++) ajouter.run();
	b.close();
	await page.goto('/journal');
	await expect(page.locator('tbody tr')).toHaveCount(50);
	await page.getByRole('link', { name: 'Page suivante' }).click();
	await expect(page).toHaveURL(/page=2/);
	await expect(page.getByText(/Page 2 sur/)).toBeVisible();
});

test('aucun écran ne permet de modifier, et le téléphone montre des rangées à deux lignes', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/journal');
	await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
	expect(await sansDefilementHorizontal(page)).toBe(true);
	const ligne = page.locator('tbody tr').first();
	const hauteur = await ligne.evaluate((e) => e.getBoundingClientRect().height);
	expect(hauteur).toBeGreaterThan(44);
	await axeSansViolation(page);
});

// Le vrai Journal vide a sa propre instance : voir 09-journal-vide.spec.ts.
test('une personne absente du Journal dit de retirer des critères', async ({ page }) => {
	await page.goto('/journal?personne=Personne-absente');
	await expect(page.getByRole('heading', { name: 'Rien ne correspond' })).toBeVisible();
});

test('le squelette n’apparaît qu’après 300 ms de chargement', async ({ page }) => {
	await page.goto('/reglages', { waitUntil: 'networkidle' });
	await page.route('**/journal/__data.json**', async (route) => {
		await new Promise((r) => setTimeout(r, 900));
		await route.continue();
	});
	await page.getByRole('link', { name: 'Journal' }).click();
	const squelette = page.locator('.squelette');
	await page.waitForTimeout(150);
	await expect(squelette).toHaveCount(0);
	await expect(squelette).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Journal');
	await expect(squelette).toHaveCount(0);
});

test('un Exercice clôturé porte son bandeau de lecture seule', async ({ page }) => {
	const b = base();
	b.exec(`UPDATE exercice SET statut = 'cloture' WHERE libelle = '2026-2027'`);
	b.close();
	await page.goto('/?exercice=2026-2027');
	await expect(page.getByText('Exercice clôturé, lecture seule')).toBeVisible();
	await expect(page.getByRole('button', { name: /^2026-2027 Clôturé/ })).toBeVisible();
	await axeSansViolation(page);
	await page.goto('/?exercice=2027-2028');
	await expect(page.getByText('Exercice clôturé, lecture seule')).toHaveCount(0);
});
