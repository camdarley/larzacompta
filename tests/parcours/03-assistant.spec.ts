import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';

test.describe.configure({ mode: 'serial' });

test('l’assistant prépare le cahier, étape par étape', async ({ page }) => {
	await connecter(page);
	await page.goto('/');
	await page.getByRole('link', { name: 'Lancer l’assistant' }).click();
	await expect(page).toHaveURL(/\/bienvenue/);

	const etapes = page.getByRole('list', { name: 'Étapes de l’assistant' });
	await expect(etapes.getByRole('listitem')).toHaveText([
		/Votre APE/,
		/Vos Comptes/,
		/Natures et Actions/,
		/Vos sommes en cours/
	]);
	await axeSansViolation(page);

	// Étape 1, avec une erreur corrigée sans perdre la saisie.
	await page.getByLabel('Adresse').fill('1 rue des Tilleuls');
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByLabel('Nom de l’APE'))
		.toBeFocused({ timeout: 1000 })
		.catch(() => {});
	await expect(page).toHaveURL(/bienvenue/);
	await page.getByLabel('Nom de l’APE').fill('APE des Tilleuls');
	await page.getByRole('button', { name: 'Continuer' }).click();

	// Quitter puis revenir reprend à l'étape atteinte.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vos Comptes');
	await page.goto('/');
	await page.goto('/bienvenue');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vos Comptes');

	// Retour sans perte.
	await page.getByRole('link', { name: 'Retour' }).click();
	await expect(page.getByLabel('Nom de l’APE')).toHaveValue('APE des Tilleuls');
	await page.getByRole('button', { name: 'Continuer' }).click();

	await expect(page.getByLabel('Premier Exercice tenu dans l’outil')).toHaveValue('2026');
	await expect(page.getByText('au 1er septembre 2026')).toBeVisible();
	await axeSansViolation(page);
	await page.locator('#solde-0').fill('1200+300,5');
	await page.locator('#solde-0').blur();
	await expect(page.locator('#solde-0')).toHaveValue(/1.500,50/);
	await page.locator('#solde-1').fill('9000');
	await page.locator('#solde-2').fill('abc');
	await page.locator('#solde-2').blur();
	await expect(page.getByText('Ce montant n’est pas lisible.')).toBeVisible();
	await page.locator('#solde-2').fill('250,40');
	await page.getByRole('button', { name: 'Continuer' }).click();

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Natures et Actions');
	await axeSansViolation(page);
	// Un seul choix décoché, pour vérifier que seul ce qui est coché est créé.
	await page.getByLabel('Buvette').uncheck();
	await page.getByLabel('Kermesse').check();
	await page.getByRole('button', { name: 'Continuer' }).click();

	// Vos sommes en cours : une somme de l'an passé, datée d'avant l'ancre.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vos sommes en cours');
	await expect(page.getByRole('button', { name: 'Passer cette étape' })).toBeVisible();
	await axeSansViolation(page);
	await page.getByLabel('Tiers').fill('Sam Fictif');
	await page.getByLabel('Motif').fill('Avance kermesse 2026');
	await page.getByLabel('Reste dû').fill('42,50');
	await page.getByRole('button', { name: 'Ajouter cette somme' }).click();
	await expect(page.getByRole('list', { name: 'Sommes reprises' })).toContainText('Sam Fictif');
	await expect(page.getByLabel('Tiers')).toHaveValue('');
	await page.getByRole('link', { name: 'Retour' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Natures et Actions');
	await page.goto('/bienvenue?etape=4');
	await expect(page.getByRole('list', { name: 'Sommes reprises' })).toContainText('Sam Fictif');
	await page.getByRole('button', { name: 'Terminer' }).click();

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre cahier est prêt.');
	await expect(page.getByRole('link', { name: 'Importer un relevé' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Saisir une Opération' })).toBeVisible();
	await axeSansViolation(page);
	await page.getByRole('link', { name: 'Aller au Tableau de contrôle' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Importez votre premier relevé pour commencer le contrôle.'
	);
	await expect(page.getByRole('main')).toContainText('1 500,50');

	const b = base();
	const exercices = b
		.prepare('SELECT libelle, statut, debut FROM exercice ORDER BY annee_debut')
		.all();
	const ancres = b
		.prepare(
			`SELECT c.libelle, b.solde_centimes AS solde, e.libelle AS exercice
			 FROM balance_ouverture b JOIN compte c ON c.id = b.compte_id JOIN exercice e ON e.id = b.exercice_id
			 ORDER BY c.ordre`
		)
		.all();
	const natures = b.prepare('SELECT libelle FROM nature').pluck().all();
	const actions = b.prepare('SELECT libelle FROM action').pluck().all();
	const systeme = b
		.prepare('SELECT code_systeme FROM nature WHERE code_systeme IS NOT NULL')
		.pluck()
		.all();
	b.close();
	expect(exercices).toEqual([
		{ libelle: '2025-2026', statut: 'repere', debut: null },
		{ libelle: '2026-2027', statut: 'ouvert', debut: '2026-09-01' }
	]);
	expect(ancres).toEqual([
		{ libelle: 'Compte courant', solde: 150050, exercice: '2026-2027' },
		{ libelle: 'Livret', solde: 900000, exercice: '2026-2027' },
		{ libelle: 'Caisse', solde: 25040, exercice: '2026-2027' }
	]);
	expect(natures).toContain('Transport');
	expect(natures).not.toContain('Buvette');
	expect(actions).toEqual(['Kermesse']);
	expect(systeme.sort()).toEqual([
		'ajustement',
		'ecart_caisse',
		'recette_especes',
		'somme_a_rendre'
	]);
});

test('l’assistant reste utilisable à 320 px', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 700 });
	await connecter(page);
	for (const etape of [1, 2, 3]) {
		await page.goto(`/bienvenue?etape=${etape}`);
		expect(await sansDefilementHorizontal(page)).toBe(true);
		await axeSansViolation(page);
	}
});
