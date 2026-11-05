import { expect, test } from '@playwright/test';
import { axeSansViolation, connecter, sansDefilementHorizontal } from './aides.ts';
import { enregistrer, montant, nouvelleDepense, panneau, choisir } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

test('2.12 : un libellé proche préremplit Nature et Action, avec la pastille', async ({ page }) => {
	await nouvelleDepense(page, {
		libelle: 'Autocars Bleus',
		montant: '90',
		date: '2027-10-08',
		nature: 'Trajets',
		action: 'Olympiades'
	});
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByLabel('Libellé').pressSequentially('autocars ble');
	const nature = panneau(page).getByRole('combobox', { name: 'Nature de la ligne 1' });
	await expect(nature).toHaveValue('Trajets');
	await expect(panneau(page).getByRole('combobox', { name: 'Action de la ligne 1' })).toHaveValue(
		'Olympiades'
	);
	await expect(panneau(page).getByText('Suggestion', { exact: true })).toBeVisible();
	await expect(panneau(page).getByText('Comme “Autocars Bleus” en octobre')).toBeVisible();
	await axeSansViolation(page);

	// Tab accepte.
	await nature.focus();
	await nature.press('Tab');
	await expect(panneau(page).getByText('Suggestion', { exact: true })).toHaveCount(0);
	await expect(nature).toHaveValue('Trajets');

	// Aucune Opération ne s'enregistre sans geste explicite.
	await expect(page).toHaveURL(/op=nouvelle/);
});

test('2.12 : taper remplace la suggestion, un libellé inconnu ne suggère rien', async ({
	page
}) => {
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByLabel('Libellé').pressSequentially('autocars ble');
	await expect(panneau(page).getByText('Suggestion', { exact: true })).toBeVisible();
	await choisir(page, 'Nature de la ligne 1', 'Papeterie');
	await expect(panneau(page).getByText('Suggestion', { exact: true })).toHaveCount(0);

	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByLabel('Libellé').pressSequentially('boulangerie imaginaire');
	await page.waitForTimeout(500);
	await expect(panneau(page).getByText('Suggestion', { exact: true })).toHaveCount(0);
});

test('2.13 : aide-terme s’ouvre au clic, au focus, au survol, se ferme avec Échap', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations');
	const terme = page.getByRole('button', { name: 'Qu’est-ce qu’une Opération ?' });
	const bulle = page.getByRole('group', { name: 'Opération' });

	await terme.focus();
	await expect(bulle).toContainText('Fait financier daté');
	await page.keyboard.press('Escape');
	await expect(bulle).toHaveCount(0);

	await terme.press('Enter');
	await expect(bulle).toBeVisible();
	await page.keyboard.press('Escape');

	await page.getByRole('heading', { level: 1 }).click();
	await terme.click();
	await expect(bulle).toBeVisible();
	await axeSansViolation(page);
	await bulle.getByRole('link', { name: 'En savoir plus' }).click();
	await expect(page).toHaveURL(/\/aide#terme-operation/);
});

test('2.13 : la bulle reste quand la souris la rejoint', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations');
	const terme = page.getByRole('button', { name: 'Qu’est-ce qu’une Opération ?' });
	const bulle = page.getByRole('group', { name: 'Opération' });
	await terme.hover();
	await expect(bulle).toBeVisible();
	await bulle.hover();
	await page.waitForTimeout(300);
	await expect(bulle).toBeVisible();
	await page.getByRole('heading', { level: 1 }).hover();
	await expect(bulle).toHaveCount(0);
});

test('2.13 : /aide réunit le Glossaire, les états, les raccourcis et la première année', async ({
	page
}) => {
	await page.goto('/aide');
	await expect(page.getByRole('heading', { name: 'Votre première année' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Glossaire' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Ce que disent les pastilles' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Raccourcis du clavier' })).toBeVisible();
	await expect(page.locator('#terme-mouvement-interne')).toContainText('Mouvement interne');
	const externes = await page.locator('main a[href^="http"]').count();
	expect(externes).toBe(0);
	await axeSansViolation(page);
});

test('2.14 : Ctrl+K ouvre la palette : écran, Opération, Action, commande, montant', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/', { waitUntil: 'networkidle' });
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Recherche globale' });
	const champ = palette.getByRole('combobox');
	await expect(champ).toBeFocused();
	await axeSansViolation(page);

	await champ.fill('journ');
	await expect(palette.getByRole('option', { name: 'Journal' })).toBeVisible();
	await champ.press('Enter');
	await expect(page).toHaveURL(/\/journal/);

	await page.keyboard.press('Control+k');
	await champ.fill('autocars du');
	await expect(palette.getByRole('option', { name: /Autocars du Sud/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(palette).toHaveCount(0);

	await page.keyboard.press('Control+k');
	await champ.fill('250');
	await expect(
		palette.getByRole('option', { name: /Ligne de 250,00.€ dans Autocars du Sud/ })
	).toBeVisible();
	await champ.press('Enter');
	await expect(page).toHaveURL(/op=\d+/);
	await expect(panneau(page)).toBeVisible();
	await page.keyboard.press('Escape');

	await page.keyboard.press('Control+k');
	await champ.fill('fa-');
	await page.keyboard.press('Escape');

	await page.keyboard.press('Control+k');
	await champ.fill('olympiades');
	await expect(palette.getByRole('option', { name: 'Olympiades' })).toBeVisible();
	await palette.getByRole('option', { name: 'Olympiades' }).click();
	await expect(page).toHaveURL(/\/operations\?action=\d+/);

	await page.keyboard.press('Control+k');
	await champ.fill('nouvelle');
	await palette.getByRole('option', { name: 'Nouvelle Opération' }).click();
	await expect(page).toHaveURL(/op=nouvelle/);
});

test('2.14 : n, ? et Échap, jamais pendant une saisie', async ({ page }) => {
	await page.goto('/operations', { waitUntil: 'networkidle' });
	await page.keyboard.type('n');
	await expect(page).toHaveURL(/op=nouvelle/);
	await expect(montant(page)).toBeFocused();
	await page.keyboard.type('n');
	await expect(montant(page)).toHaveValue('n');
	await montant(page).fill('');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
	await expect(page).not.toHaveURL(/op=/);

	await page.getByLabel('Chercher une Opération').focus();
	await page.keyboard.type('n?');
	await expect(page).not.toHaveURL(/op=/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.getByRole('heading', { level: 1 }).click();

	await page.keyboard.type('?');
	const aide = page.getByRole('dialog', { name: 'Raccourcis du clavier' });
	await expect(aide).toBeVisible();
	await axeSansViolation(page);
	await page.keyboard.press('Escape');
	await expect(aide).toHaveCount(0);
});

test('2.14 : le code lit le caractère produit, juste sur un clavier AZERTY', async ({ page }) => {
	await page.goto('/operations', { waitUntil: 'networkidle' });
	// Sur AZERTY, `?` sort de Maj + la touche physique `M` : seul le caractère compte.
	await page.evaluate(() => {
		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: '?', code: 'KeyM', shiftKey: true, bubbles: true })
		);
	});
	await expect(page.getByRole('dialog', { name: 'Raccourcis du clavier' })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.evaluate(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyQ', bubbles: true }));
	});
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('2.14 : raccourcis désactivés : aucune touche seule n’agit, Ctrl+K reste', async ({
	page
}) => {
	await page.goto('/preferences');
	await page.getByLabel('Activer les raccourcis du clavier').uncheck();
	await expect(page.getByText('Enregistré.')).toBeVisible();
	await page.goto('/operations', { waitUntil: 'networkidle' });
	await page.getByRole('heading', { level: 1 }).click();
	await page.keyboard.type('n?');
	await expect(page).not.toHaveURL(/op=/);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog', { name: 'Recherche globale' })).toBeVisible();
	await page.keyboard.press('Escape');

	await page.goto('/preferences');
	await page.getByLabel('Activer les raccourcis du clavier').check();
	await expect(page.getByText('Enregistré.')).toBeVisible();
});

test('2.14 : `touche` est masqué sur téléphone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/operations?op=nouvelle');
	await expect(enregistrer(page)).toBeVisible();
	await expect(enregistrer(page).locator('kbd').first()).toBeHidden();
	await page.waitForTimeout(100);
	expect(await sansDefilementHorizontal(page)).toBe(true);
});
