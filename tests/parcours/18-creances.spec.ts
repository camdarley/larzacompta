import { expect, test, type Page } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import { choisir, enregistrer, panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await connecter(page);
});

const bloc = (page: Page, nom: 'À recevoir' | 'À payer') => page.getByRole('region', { name: nom });

async function ajouter(
	page: Page,
	s: { sens: 'creance' | 'dette'; tiers: string; motif: string; montant: string; action?: string }
) {
	await page.goto('/creances-dettes?ajout=creance', { waitUntil: 'networkidle' });
	await panneau(page).getByLabel('Sens').selectOption(s.sens);
	await panneau(page).getByLabel('Tiers').fill(s.tiers);
	await panneau(page).getByLabel('Motif').fill(s.motif);
	await panneau(page).getByLabel('Montant').fill(s.montant);
	if (s.action) await panneau(page).getByLabel('Action').selectOption({ label: s.action });
	await panneau(page).getByRole('button', { name: 'Enregistrer' }).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });
}

async function solder(page: Page, tiers: string) {
	await page
		.getByRole('row', { name: new RegExp(tiers) })
		.getByRole('link', { name: 'Solder' })
		.click();
	await expect(panneau(page)).toBeVisible();
}

function reglements(tiers: string) {
	const b = base();
	const r = b
		.prepare(
			`SELECT r.montant_centimes AS montant FROM reglement r
			 JOIN creance_dette c ON c.id = r.creance_dette_id WHERE c.tiers = ? ORDER BY r.id`
		)
		.pluck()
		.all(tiers);
	b.close();
	return r;
}

test('4.6 : une somme reprise se solde, rattachée à son Exercice d’origine', async ({ page }) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(bloc(page, 'À payer')).toContainText('Sam Fictif');
	await expect(bloc(page, 'À payer')).toContainText('42,50');
	await axeSansViolation(page);

	await solder(page, 'Sam Fictif');
	await expect(panneau(page).getByText('Cette Opération solde')).toBeVisible();
	await expect(panneau(page).getByLabel('Montant', { exact: true })).toHaveValue(/42,50/);
	await expect(panneau(page).getByLabel('Tiers')).toHaveValue('Sam Fictif');
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue(/Sam Fictif/);
	await expect(panneau(page).getByText('Cette somme date de 2025-2026')).toBeVisible();
	await choisir(page, 'Nature de la ligne 1', 'Papeterie');
	await axeSansViolation(page);
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });

	const b = base();
	const ligne = b
		.prepare(
			`SELECT e.libelle FROM ligne l JOIN exercice e ON e.id = l.exercice_rattachement_id
			 JOIN reglement r ON r.operation_id = l.operation_id`
		)
		.pluck()
		.get();
	b.close();
	expect(ligne).toBe('2025-2026');
});

test('4.4 : rien en attente, l’état vide le dit, et propose Ajouter', async ({ page }) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(page.getByText('Rien en attente')).toBeVisible();
	await expect(
		page.getByText('Personne ne doit rien à l’APE, et l’APE ne doit rien à personne.')
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ajouter' })).toBeVisible();
	await axeSansViolation(page);

	await page.setViewportSize({ width: 320, height: 640 });
	await expect(page.getByRole('link', { name: 'Ajouter' })).toBeHidden();
	await axeSansViolation(page);
});

test('4.4 : une somme s’ajoute sans aucune Ligne, un remboursement est une Dette', async ({
	page
}) => {
	const b = base();
	const avant = b.prepare('SELECT count(*) FROM ligne').pluck().get();
	b.close();
	await ajouter(page, {
		sens: 'creance',
		tiers: 'Mairie imaginaire',
		motif: 'Subvention',
		montant: '300'
	});
	await ajouter(page, {
		sens: 'dette',
		tiers: 'Alex Fictif',
		motif: 'Remboursement goûter',
		montant: '40'
	});
	await ajouter(page, {
		sens: 'dette',
		tiers: 'Dominique Fictive',
		motif: 'Remboursement affiches',
		montant: '60'
	});
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(bloc(page, 'À recevoir')).toContainText('Mairie imaginaire');
	await expect(bloc(page, 'À recevoir').getByText('300,00').first()).toBeVisible();
	await expect(bloc(page, 'À payer').getByText('100,00')).toBeVisible();
	const c = base();
	expect(c.prepare('SELECT count(*) FROM ligne').pluck().get()).toBe(avant);
	c.close();
	await axeSansViolation(page);
});

test('4.4 : la saisie se contrôle, et la saisie reste à l’écran', async ({ page }) => {
	await page.goto('/creances-dettes?ajout=dette', { waitUntil: 'networkidle' });
	await panneau(page).getByLabel('Tiers').fill('Sans montant');
	await panneau(page).getByLabel('Motif').fill('Oubli');
	await panneau(page).getByRole('button', { name: 'Enregistrer' }).click();
	await expect(panneau(page).getByText('Ce champ est à remplir.').first()).toBeVisible();
	await expect(panneau(page).getByLabel('Tiers')).toHaveValue('Sans montant');
});

test('4.5 : un paiement partiel laisse le reste dû, et la ligne visible', async ({ page }) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await solder(page, 'Mairie imaginaire');
	await expect(panneau(page).getByLabel('Montant', { exact: true })).toHaveValue(/300,00/);
	await panneau(page).getByLabel('Montant', { exact: true }).fill('100');
	await choisir(page, 'Nature de la ligne 1', 'Papeterie');
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });
	await expect(bloc(page, 'À recevoir')).toContainText('200,00');
	await expect(bloc(page, 'À recevoir')).toContainText('sur 300,00');
	expect(reglements('Mairie imaginaire')).toEqual([100_00]);
});

test('F1 : un règlement au-delà du reste est refusé', async ({ page }) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await solder(page, 'Mairie imaginaire');
	await panneau(page).getByLabel('Montant', { exact: true }).fill('250');
	await choisir(page, 'Nature de la ligne 1', 'Papeterie');
	await enregistrer(page).click();
	await expect(panneau(page).getByRole('alert')).toContainText('dépasse le reste dû');
	expect(reglements('Mairie imaginaire')).toEqual([100_00]);
});

test('4.5 : une Opération solde plusieurs Dettes, chaque règlement porte sa part', async ({
	page
}) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await solder(page, 'Alex Fictif');
	await panneau(page).getByRole('button', { name: 'Solder une autre somme' }).click();
	const autre = panneau(page).getByRole('combobox', { name: 'Autre somme à solder' });
	await autre.click();
	await panneau(page)
		.getByRole('option', { name: /Dominique Fictive/ })
		.click();
	await expect(panneau(page).getByLabel('Montant', { exact: true })).toHaveValue(/100,00/);
	await panneau(page).getByLabel('Part de Dominique Fictive').fill('50');
	await panneau(page).getByLabel('Montant', { exact: true }).fill('90');
	await panneau(page).getByLabel('Montant de la ligne 2').fill('50');
	await choisir(page, 'Nature de la ligne 1', 'Papeterie');
	await choisir(page, 'Nature de la ligne 2', 'Papeterie');
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });

	expect(reglements('Alex Fictif')).toEqual([40_00]);
	expect(reglements('Dominique Fictive')).toEqual([50_00]);
	await expect(bloc(page, 'À payer').getByRole('row', { name: /Alex Fictif/ })).toHaveCount(0);
	await expect(bloc(page, 'À payer')).toContainText('10,00');
});

test('F2 : annuler l’Opération fait remonter le reste dû', async ({ page }) => {
	const b = base();
	const op = b
		.prepare(
			`SELECT r.operation_id FROM reglement r JOIN creance_dette c ON c.id = r.creance_dette_id
			 WHERE c.tiers = 'Mairie imaginaire'`
		)
		.pluck()
		.get();
	b.close();
	await page.goto(`/operations?op=${op}`, { waitUntil: 'networkidle' });
	await expect(panneau(page).getByRole('region', { name: 'Sommes soldées' })).toContainText(
		'Mairie imaginaire'
	);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await page.getByRole('button', { name: 'Annuler l’Opération' }).click();
	await page
		.getByRole('dialog', { name: 'Annuler l’Opération ?' })
		.getByRole('button', { name: 'Annuler l’Opération' })
		.click();
	await expect(panneau(page).getByText('Cette Opération est annulée')).toBeVisible();

	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(bloc(page, 'À recevoir').getByRole('row', { name: /Mairie/ })).toContainText(
		'300,00'
	);
	await expect(bloc(page, 'À recevoir').getByText('sur 300,00')).toHaveCount(0);
});

test('une somme s’annule, et se rétablit par toast', async ({ page }) => {
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Actions de Mairie imaginaire' }).click();
	await page.getByRole('button', { name: 'Annuler cette somme' }).click();
	const rangee = page.getByRole('row', { name: /Mairie imaginaire/ });
	await expect(rangee).toHaveCount(0);
	await page.getByRole('status').getByRole('button', { name: 'Annuler' }).click();
	await expect(rangee).toBeVisible();
});

test('4.4 : le téléphone est en consultation', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(bloc(page, 'À recevoir')).toContainText('Mairie imaginaire');
	await expect(page.getByRole('link', { name: 'Solder' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Ajouter' })).toHaveCount(0);
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
});

test('Lecteur·rice : Créances, Dettes et Pièces en lecture seule', async ({ page }) => {
	await page.goto('/deconnexion');
	await page.context().clearCookies();
	await connecter(page, { identifiant: 'lecture', motDePasse: 'un mot de passe de lecture' });

	await page.goto('/creances-dettes', { waitUntil: 'networkidle' });
	await expect(bloc(page, 'À recevoir')).toContainText('Mairie imaginaire');
	await expect(page.getByRole('link', { name: 'Solder' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Ajouter' })).toHaveCount(0);
	await page.goto('/creances-dettes?ajout=dette', { waitUntil: 'networkidle' });
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.goto('/pieces', { waitUntil: 'networkidle' });
	await expect(page.getByRole('button', { name: 'Joindre' })).toHaveCount(0);
	await axeSansViolation(page);
	await page.goto('/pieces/toutes', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: 'Ouvrir commune.pdf' }).click();
	await expect(panneau(page).getByRole('link', { name: 'Télécharger' })).toBeVisible();
	await expect(panneau(page).getByRole('button', { name: 'Rattacher' })).toHaveCount(0);

	const refus = await page.goto('/pieces/photo');
	expect(refus?.status()).toBe(403);
});
