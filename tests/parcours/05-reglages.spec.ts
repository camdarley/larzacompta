import { expect, test } from '@playwright/test';
import { connecter, base } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

function dernierJournal() {
	const b = base();
	const r = b
		.prepare('SELECT evenement, resume FROM journal_modification ORDER BY id DESC LIMIT 1')
		.get() as { evenement: string; resume: string };
	b.close();
	return r;
}

test('l’identité s’enregistre et se lit dans la barre et le titre', async ({ page }) => {
	await page.goto('/reglages');
	await page.getByLabel('Nom de l’APE').fill('APE des Marronniers');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('status').getByText('Enregistré.')).toBeVisible();
	await expect(page.locator('aside').getByText('APE des Marronniers')).toBeVisible();
	await expect(page).toHaveTitle(/APE des Marronniers/);
	expect(dernierJournal().evenement).toBe('association.modifiee');
	await page.getByLabel('Nom de l’APE').fill('APE des Tilleuls');
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.locator('aside').getByText('APE des Tilleuls')).toBeVisible();
});

test('chaque onglet a son URL et se parcourt aux flèches', async ({ page }) => {
	await page.goto('/reglages');
	const sections = page.getByRole('navigation', { name: 'Sections des Réglages' });
	await sections.getByRole('link', { name: 'Association' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(sections.getByRole('link', { name: 'Comptes' })).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowLeft');
	await expect(sections.getByRole('link', { name: 'Exercices' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/reglages\/exercices$/);
	await expect(sections.getByRole('link', { name: 'Exercices' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test.describe('Comptes', () => {
	test('un Compte se crée, en bout de liste', async ({ page }) => {
		await page.goto('/reglages/comptes');
		await page.getByRole('link', { name: 'Créer un Compte' }).click();
		const types = page.getByLabel('Type').locator('option');
		await expect(types).toHaveText(['Banque', 'Épargne', 'Caisse']);
		await page.getByLabel('Nom du Compte').fill('Caisse 2');
		await page.getByLabel('Type').selectOption('caisse');
		await page.getByLabel('Solde de départ', { exact: true }).fill('150');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(page.getByRole('link', { name: 'Caisse 2' })).toBeVisible();
		await expect(page.getByRole('row', { name: /^Caisse 2 / })).toContainText('150,00');
		expect(dernierJournal().evenement).toBe('balance.modifiee');
	});

	test('un libellé pris affiche l’erreur et garde la saisie', async ({ page }) => {
		await page.goto('/reglages/comptes?compte=nouveau');
		await page.getByLabel('Nom du Compte').fill('LIVRET');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByText('Ce nom existe déjà.')).toBeVisible();
		await expect(page.getByLabel('Nom du Compte')).toHaveValue('LIVRET');
		await expect(page.getByRole('dialog')).toBeVisible();
	});

	test('un Compte avec ancre se désactive, sans suppression proposée', async ({ page }) => {
		await page.goto('/reglages/comptes');
		await page.getByRole('link', { name: 'Caisse 2' }).click();
		await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Désactiver' }).click();
		await expect(page.getByRole('row', { name: /^Caisse 2 / })).toContainText('Désactivé');
		await page.getByRole('link', { name: 'Caisse 2' }).click();
		await page.getByRole('button', { name: 'Réactiver' }).click();
		await expect(page.getByRole('row', { name: /^Caisse 2 / })).toContainText('Actif');
	});

	test('un Compte sans mouvement ni ancre se supprime après confirmation', async ({ page }) => {
		const b = base();
		b.exec(`INSERT INTO compte (libelle, type, ordre) VALUES ('Compte de passage', 'banque', 99)`);
		b.close();
		await page.goto('/reglages/comptes');
		await page.getByRole('link', { name: 'Compte de passage' }).click();
		await page.getByRole('button', { name: 'Supprimer' }).click();
		const dialogue = page.getByRole('dialog', { name: 'Supprimer Compte de passage ?' });
		await expect(dialogue.getByRole('button', { name: 'Revenir' })).toBeFocused();
		await dialogue.getByRole('button', { name: 'Supprimer' }).click();
		await expect(page.getByRole('link', { name: 'Compte de passage' })).toHaveCount(0);
	});

	test('l’ordre change aux boutons', async ({ page }) => {
		await page.goto('/reglages/comptes');
		await page.getByRole('button', { name: 'Monter Caisse 2' }).click();
		await expect(page.locator('tbody tr td:first-child')).toHaveText([
			'Compte courant',
			'Livret',
			'Caisse 2',
			'Caisse'
		]);
	});
});

test.describe('Natures', () => {
	test('se crée avec son Groupe, se renomme, se désactive', async ({ page }) => {
		await page.goto('/reglages/natures');
		await page.getByRole('link', { name: 'Créer une Nature' }).click();
		await page.getByLabel('Nom de la Nature').fill('Reprographie');
		await page.getByLabel('Groupe').selectOption({ label: 'Fonctionnement' });
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByRole('link', { name: 'Reprographie' })).toBeVisible();

		await page.getByRole('link', { name: 'Reprographie' }).click();
		await page.getByLabel('Nom de la Nature').fill('Photocopies');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByRole('link', { name: 'Photocopies' })).toBeVisible();
		expect(dernierJournal().resume).toBe('a renommé la Nature Reprographie en Photocopies.');

		await page.getByRole('link', { name: 'Photocopies' }).click();
		await page.getByRole('button', { name: 'Désactiver' }).click();
		await expect(page.getByRole('row', { name: /Photocopies/ })).toContainText('Désactivée');
	});

	test('une Nature système reste telle quelle', async ({ page }) => {
		await page.goto('/reglages/natures');
		await expect(page.getByRole('row', { name: /Écart de caisse/ })).toContainText(
			'Nature de l’outil'
		);
		await page.getByRole('link', { name: 'Écart de caisse' }).click();
		await expect(page.getByText('Cette Nature sert au calcul de l’outil')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Désactiver' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
	});
});

test.describe('Actions', () => {
	test('l’état vide s’affiche sans Action', async ({ page }) => {
		const b = base();
		b.exec('DELETE FROM action');
		b.close();
		await page.goto('/reglages/actions');
		await expect(page.getByRole('heading', { name: 'Pas encore d’Action' })).toBeVisible();
		await expect(page.getByText('Une Action, c’est une activité dont vous voulez')).toHaveCount(2);
		await page.getByRole('link', { name: 'Créer une Action' }).click();
		await page.getByLabel('Nom de l’Action').fill('Kermesse');
		await page.getByLabel('Groupe').selectOption({ label: 'Évènements' });
		await page.getByLabel('Avec caisse').check();
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByRole('row', { name: /Kermesse/ })).toContainText('Avec caisse');
	});
});

test.describe('Groupes', () => {
	test('l’ordre change par monter et descendre', async ({ page }) => {
		await page.goto('/reglages/groupes');
		const premiers = page.locator('tbody tr td:first-child');
		await expect(premiers.first()).toHaveText('Évènements');
		await page.getByRole('button', { name: 'Descendre Évènements' }).click();
		await expect(premiers.first()).toHaveText('Subventions');
		await page.getByRole('button', { name: 'Monter Évènements' }).click();
		await expect(premiers.first()).toHaveText('Évènements');
	});

	test('se crée, se supprime s’il est vide, jamais s’il porte des éléments', async ({ page }) => {
		await page.goto('/reglages/groupes');
		await page.getByRole('link', { name: 'Créer un Groupe' }).click();
		await page.getByLabel('Nom du Groupe').fill('Divers');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await page.getByRole('link', { name: 'Divers' }).click();
		await page.getByRole('button', { name: 'Supprimer' }).click();
		await page
			.getByRole('dialog', { name: 'Supprimer Divers ?' })
			.getByRole('button', { name: 'Supprimer' })
			.click();
		await expect(page.getByRole('link', { name: 'Divers' })).toHaveCount(0);

		await page.getByRole('link', { name: 'Fonctionnement' }).click();
		await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
		await expect(page.getByText('Ce Groupe porte des Natures ou des Actions')).toBeVisible();
	});
});
