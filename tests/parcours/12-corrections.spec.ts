import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import {
	compteId,
	enregistrer,
	montant,
	nouvelleDepense,
	operationId,
	panneau,
	pointerEnBase
} from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

test('2.5 : ?op=id montre les mêmes champs, l’Historique et le menu', async ({ page }) => {
	const id = operationId('Papeterie du Lac');
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Papeterie du Lac');
	await expect(montant(page)).toHaveValue('100,00');
	await expect(panneau(page).getByRole('heading', { name: 'Historique' })).toBeVisible();
	await expect(panneau(page).getByText(/Camille Fictive a enregistré la Dépense/)).toBeVisible();
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await expect(panneau(page).getByRole('button', { name: 'Dupliquer' })).toBeVisible();
	await expect(panneau(page).getByRole('button', { name: 'Annuler l’Opération' })).toBeVisible();
	await axeSansViolation(page);
	await page.keyboard.press('Escape');

	await panneau(page).getByLabel('Libellé').fill('Papeterie du Lac corrigée');
	await enregistrer(page).click();
	await expect(page.getByText('Enregistré.')).toBeVisible();
	await expect(page.locator('tbody')).toContainText('Papeterie du Lac corrigée');
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page).getByText(/a modifié la Dépense/)).toBeVisible();
	await panneau(page).getByLabel('Libellé').fill('Papeterie du Lac');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
});

test('2.5 : Dupliquer repart des mêmes Lignes, à la date du jour', async ({ page }) => {
	const id = operationId('Autocars du Sud');
	await page.goto(`/operations?op=${id}`);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await panneau(page).getByRole('button', { name: 'Dupliquer' }).click();
	await expect(page).toHaveURL(/depuis=\d+/);
	await expect(panneau(page).getByRole('heading', { name: 'Nouvelle Opération' })).toBeVisible();
	await expect(panneau(page).getByLabel('Montant de la ligne 3')).toHaveValue('150,00');
	await expect(panneau(page).getByLabel('Date')).not.toHaveValue('2027-10-10');
});

test('2.5 : deux personnes : la seconde est refusée, ses changements restent', async ({
	page,
	browser
}) => {
	const id = operationId('Colle fictive');
	await page.goto(`/operations?op=${id}`);
	await expect(montant(page)).toHaveValue('12,50');

	const autre = await browser.newContext({
		baseURL: test.info().project.use.baseURL,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const seconde = await autre.newPage();
	await connecter(seconde);
	await seconde.goto(`/operations?op=${id}`);
	await panneau(seconde).getByLabel('Libellé').fill('Colle corrigée ailleurs');
	await enregistrer(seconde).click();
	await expect(seconde).not.toHaveURL(/op=/);
	await autre.close();

	await panneau(page).getByLabel('Libellé').fill('Ma correction à moi');
	await enregistrer(page).click();
	await expect(panneau(page).getByRole('alert')).toContainText(
		'Cette Opération vient d’être modifiée par une autre personne.'
	);
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Ma correction à moi');

	await panneau(page).getByRole('button', { name: 'Recharger' }).click();
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Colle corrigée ailleurs');
});

test('2.5 : un Côté pointé verrouille montant et Compte, le reste se corrige', async ({ page }) => {
	await nouvelleDepense(page, {
		libelle: 'Opération pointée fictive',
		montant: '40',
		date: '2027-10-15'
	});
	const id = operationId('Opération pointée fictive');
	pointerEnBase(id);
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page).getByText('Cette Opération est pointée')).toBeVisible();
	await expect(montant(page)).toHaveAttribute('readonly', '');
	await expect(panneau(page).getByRole('combobox', { name: 'Compte' })).toHaveAttribute(
		'readonly',
		''
	);
	await expect(panneau(page).getByRole('heading', { name: 'Mouvement bancaire' })).toBeVisible();
	await expect(panneau(page).getByText('VIR FICTIF')).toBeVisible();
	await axeSansViolation(page);

	await panneau(page).getByLabel('Libellé').fill('Pointée, libellé corrigé');
	await panneau(page).getByLabel('Note', { exact: true }).fill('Note libre');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	await expect(page.locator('tbody')).toContainText('Pointée, libellé corrigé');
	await expect(page.getByRole('row', { name: /Pointée, libellé corrigé/ })).toContainText('Pointé');

	// Le refus tient aussi côté serveur (O8).
	const r = await page.evaluate(
		(n) => fetch(`/api/operations/${n}/annuler`, { method: 'POST' }).then((x) => x.json()),
		id
	);
	expect(r.code).toBe('cote_pointe');
});

test('2.5 : une Opération d’origine spécialisée ne change que libellé et note', async ({
	page
}) => {
	await nouvelleDepense(page, {
		libelle: 'Recette de caisse fictive',
		montant: '30',
		date: '2027-10-16'
	});
	const id = operationId('Recette de caisse fictive');
	const b = base();
	b.prepare("UPDATE operation SET origine = 'recette_especes' WHERE id = ?").run(id);
	b.close();
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page).getByText('Cette Opération vient d’une autre page.')).toBeVisible();
	await expect(montant(page)).toHaveAttribute('readonly', '');
	await expect(panneau(page).getByLabel('Date')).toHaveAttribute('readonly', '');
	await panneau(page).getByLabel('Libellé').fill('Recette de caisse renommée');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
});

test('2.5 : annuler sort l’Opération des comptes, elle reste visible avec son état', async ({
	page
}) => {
	await nouvelleDepense(page, { libelle: 'Saisie par erreur', montant: '77', date: '2027-10-17' });
	const id = operationId('Saisie par erreur');
	await page.goto(`/operations?op=${id}`);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await panneau(page).getByRole('button', { name: 'Annuler l’Opération' }).click();
	const dialogue = page.getByRole('dialog', { name: 'Annuler l’Opération ?' });
	await expect(dialogue.getByRole('button', { name: 'Garder l’Opération' })).toBeFocused();
	await axeSansViolation(page);
	await dialogue.getByRole('button', { name: 'Annuler l’Opération' }).click();
	await expect(
		panneau(page).getByText('Cette Opération est annulée. Elle reste visible ici')
	).toBeVisible();
	await expect(panneau(page).getByText(/a annulé l’Opération/)).toBeVisible();
	await expect(panneau(page).getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('row', { name: /Saisie par erreur/ })).toContainText('Annulée');

	const b = base();
	const j = b
		.prepare("SELECT count(*) FROM journal_modification WHERE evenement = 'operation.annulee'")
		.pluck()
		.get();
	b.close();
	expect(j).toBe(1);
});

test('2.5 : dans un Exercice clôturé, le message prévu, sans action d’édition', async ({
	page
}) => {
	const b = base();
	const acces = b.prepare('SELECT id FROM acces ORDER BY id DESC LIMIT 1').pluck().get();
	const compte = compteId('Livret');
	const nature = b.prepare("SELECT id FROM nature WHERE libelle = 'Trajets'").pluck().get();
	b.prepare(
		`UPDATE exercice SET debut = '2025-09-01', fin = '2026-08-31', statut = 'ouvert' WHERE libelle = '2025-2026'`
	).run();
	const exercice = b.prepare("SELECT id FROM exercice WHERE libelle = '2025-2026'").pluck().get();
	const op = b
		.prepare(
			`INSERT INTO operation (genre, date, libelle, cree_le, cree_par)
			 VALUES ('standard', '2026-03-12', 'Autocars de mars', '2026-03-12T10:00:00.000Z', ?)`
		)
		.run(acces).lastInsertRowid;
	b.prepare(
		`INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (?, ?, '2026-03-12', -5000)`
	).run(op, compte);
	b.prepare(
		`INSERT INTO ligne (operation_id, ordre, montant_centimes, nature_id, exercice_rattachement_id)
		 VALUES (?, 1, -5000, ?, ?)`
	).run(op, nature, exercice);
	b.prepare("UPDATE exercice SET statut = 'cloture' WHERE libelle = '2025-2026'").run();
	b.close();

	await page.goto(`/operations?exercice=2025-2026&op=${op}`);
	await expect(panneau(page).getByText('2025-2026 est clôturé')).toBeVisible();
	await expect(panneau(page).getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
	await expect(panneau(page).getByRole('textbox')).toHaveCount(0);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await expect(panneau(page).getByRole('button', { name: 'Annuler l’Opération' })).toHaveCount(0);
	await axeSansViolation(page);
	await page.setViewportSize({ width: 320, height: 640 });
	await page.waitForTimeout(250);
	expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('2.5 : une Opération introuvable reste calme', async ({ page }) => {
	await page.goto('/operations?op=999999');
	await expect(panneau(page).getByText('Cet élément n’existe plus.')).toBeVisible();
});
