import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import { choisir, depense, montant, panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

// Les parcours précédents ont clôturé 2026-2027 : tout se joue dans 2027-2028, seul Exercice ouvert.
test.beforeAll(() => {
	const b = base();
	const groupe = b.prepare("SELECT id FROM groupe WHERE libelle = 'Fonctionnement'").pluck().get();
	const natures = b.prepare('INSERT OR IGNORE INTO nature (libelle, groupe_id) VALUES (?, ?)');
	for (const n of ['Trajets', 'Papeterie', 'Cachets']) natures.run(n, groupe);
	const actions = b.prepare('INSERT OR IGNORE INTO action (libelle, groupe_id) VALUES (?, ?)');
	for (const a of ['Sortie mer', 'Olympiades', 'Sortie ferme', 'Fête d’école']) {
		actions.run(a, groupe);
	}
	b.close();
});

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

test('2.2 : le panneau part de l’intention, à droite de la liste, sans signe à saisir', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations');
	await expect(page.getByRole('heading', { name: 'Pas encore d’Opération' })).toBeVisible();
	await axeSansViolation(page);

	await page.getByRole('link', { name: 'Nouvelle Opération' }).first().click();
	await expect(page).toHaveURL(/op=nouvelle/);
	await expect(panneau(page).getByRole('heading', { name: 'Nouvelle Opération' })).toBeVisible();
	const intentions = panneau(page).getByRole('group', { name: 'Intention' });
	await expect(intentions.getByRole('button')).toHaveText([
		'Dépense',
		'Recette',
		'Entre Comptes',
		/Autre/
	]);
	await expect(intentions.getByRole('button', { name: 'Dépense' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.waitForTimeout(300);
	const boite = await panneau(page).boundingBox();
	expect(boite?.width).toBe(560);
	expect(boite?.x).toBe(720);
	await axeSansViolation(page);
});

test('2.2 : champ-montant additionne, formate et reste en clavier décimal', async ({ page }) => {
	await page.goto('/operations?op=nouvelle');
	await expect(montant(page)).toHaveAttribute('inputmode', 'decimal');
	await montant(page).fill('220+180');
	await expect(panneau(page).getByText(/= 400,00/)).toBeVisible();
	await montant(page).blur();
	await expect(montant(page)).toHaveValue(/^400,00$/);
});

test('2.2 : selecteur-recherche filtre, se pilote au clavier, crée à la volée', async ({
	page
}) => {
	await page.goto('/operations?op=nouvelle');
	const action = panneau(page).getByRole('combobox', { name: 'Action de la ligne 1' });
	await expect(action).toHaveAttribute('placeholder', 'Sans Action');
	await action.click();
	await expect(panneau(page).getByRole('option', { name: 'Sans Action' })).toBeVisible();
	await action.fill('olym');
	await expect(panneau(page).getByRole('listbox').getByRole('option')).toHaveText([
		/Olympiades/,
		/Créer l’Action olym/
	]);
	await action.press('ArrowDown');
	await action.press('ArrowUp');
	await action.press('Enter');
	await expect(action).toHaveValue('Olympiades');

	await action.fill('Vide-greniers');
	await panneau(page)
		.getByRole('option', { name: /Créer l’Action Vide-greniers/ })
		.click();
	await expect(action).toHaveValue('Vide-greniers');
	const b = base();
	const nb = b.prepare("SELECT count(*) FROM action WHERE libelle = 'Vide-greniers'").pluck().get();
	b.prepare("UPDATE action SET actif = 0 WHERE libelle = 'Vide-greniers'").run();
	b.close();
	expect(nb).toBe(1);

	await page.goto('/operations?op=nouvelle');
	const encore = panneau(page).getByRole('combobox', { name: 'Action de la ligne 1' });
	await encore.fill('Vide-greniers');
	await expect(
		panneau(page).getByRole('option', { name: 'Vide-greniers', exact: true })
	).toHaveCount(0);
	// Échap ferme la liste, pas le panneau.
	await encore.press('Escape');
	await expect(panneau(page)).toBeVisible();
	await expect(panneau(page).getByRole('listbox')).toHaveCount(0);
});

test('2.2 : Enregistrer, puis Enregistrer et continuer avec même date et même Compte', async ({
	page
}) => {
	await page.goto('/operations?op=nouvelle');
	await depense(page, {
		libelle: 'Papeterie du Lac',
		montant: '100',
		date: '2027-10-05',
		action: 'Fête d’école'
	});
	await panneau(page).getByLabel('Paiement').selectOption('cheque');
	await expect(panneau(page).getByLabel('N° de chèque')).toBeVisible();
	await panneau(page).getByLabel('N° de chèque').fill('0000421');
	await panneau(page).getByLabel('Bénéficiaire').fill('Papeterie du Lac');
	await panneau(page).getByLabel('Note', { exact: true }).fill('Cartouches');

	await panneau(page).getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(page.getByText('Enregistré.')).toBeVisible();
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('');
	await expect(panneau(page).getByLabel('Date')).toHaveValue('2027-10-05');
	await expect(panneau(page).getByRole('combobox', { name: 'Compte' })).toHaveValue(
		'Compte courant'
	);
	// La liste derrière s'est rechargée sans fermer le panneau.
	await expect(page.locator('tbody')).toContainText('Papeterie du Lac');

	await depense(page, { libelle: 'Colle fictive', montant: '12,50', date: '2027-10-06' });
	await page.keyboard.press('Control+Enter');
	await expect(panneau(page)).toHaveCount(0);
	await expect(page).not.toHaveURL(/op=/);
	await expect(page.locator('tbody')).toContainText('Colle fictive');

	const b = base();
	const ligne = b
		.prepare(
			`SELECT o.libelle, o.mode_paiement AS mode, o.reference, o.tiers, o.note, c.montant_centimes AS cote,
			        l.montant_centimes AS ligne, n.libelle AS nature, a.libelle AS action
			 FROM operation o JOIN cote c ON c.operation_id = o.id JOIN ligne l ON l.operation_id = o.id
			 JOIN nature n ON n.id = l.nature_id LEFT JOIN action a ON a.id = l.action_id
			 WHERE o.libelle = 'Papeterie du Lac'`
		)
		.get();
	const journal = b
		.prepare("SELECT resume FROM journal_modification WHERE evenement = 'operation.creee' LIMIT 1")
		.pluck()
		.get();
	b.close();
	expect(ligne).toEqual({
		libelle: 'Papeterie du Lac',
		mode: 'cheque',
		reference: '0000421',
		tiers: 'Papeterie du Lac',
		note: 'Cartouches',
		cote: -10000,
		ligne: -10000,
		nature: 'Papeterie',
		action: 'Fête d’école'
	});
	expect(journal).toContain('Papeterie du Lac');
});

test('2.2 : un montant manquant s’explique, et une saisie en cours ne se perd pas', async ({
	page
}) => {
	// Hydratée d'abord : sinon Entrée recharge toute la page et le lien n'a plus de focus à reprendre.
	await page.goto('/operations', { waitUntil: 'networkidle' });
	const lien = page.getByRole('link', { name: 'Nouvelle Opération' }).first();
	await lien.focus();
	await lien.press('Enter');
	await panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(panneau(page).getByText('Ce champ est à remplir.').first()).toBeVisible();
	await expect(montant(page)).toBeFocused();

	await panneau(page).getByLabel('Libellé').fill('Brouillon à ne pas perdre');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('heading', { name: 'Quitter sans enregistrer ?' })).toBeVisible();
	await page.getByRole('button', { name: 'Continuer la saisie' }).click();
	await expect(panneau(page).first().getByLabel('Libellé')).toHaveValue(
		'Brouillon à ne pas perdre'
	);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
	await expect(page).not.toHaveURL(/op=/);
	await expect(lien).toBeFocused();
});

test('2.2 : sur téléphone, plein écran, une colonne, date et Compte d’abord', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/operations?op=nouvelle');
	await page.waitForTimeout(300);
	const b = await panneau(page).boundingBox();
	expect(b?.width).toBe(390);
	expect(b?.height).toBe(780);
	const date = await panneau(page).getByLabel('Date').boundingBox();
	const compte = await panneau(page).getByRole('combobox', { name: 'Compte' }).boundingBox();
	const m = await montant(page).boundingBox();
	expect(date!.y).toBeLessThan(compte!.y);
	expect(compte!.y).toBeLessThan(m!.y);
	const bouton = panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first();
	expect((await bouton.boundingBox())!.y).toBeGreaterThan(680);
	await axeSansViolation(page);
	await page.setViewportSize({ width: 320, height: 640 });
	await page.waitForTimeout(100);
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
});

test('2.3 : une facture de 1 000 € se répartit entre trois Actions', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations?op=nouvelle');
	await montant(page).fill('1000');
	await panneau(page).getByLabel('Date').fill('2027-10-10');
	await panneau(page).getByLabel('Libellé').fill('Autocars du Sud');
	const reste = page.getByTestId('reste');
	await expect(reste).toContainText('Tout est réparti');

	const ligne1 = panneau(page).getByLabel('Montant de la ligne 1');
	await expect(ligne1).toHaveValue(/1.000,00/);
	await ligne1.fill('600');
	await expect(reste).toContainText(/Reste à répartir/);
	await expect(reste).toContainText(/400,00/);
	await expect(panneau(page).getByLabel('Montant de la ligne 2')).toHaveCount(0);
	await expect(
		panneau(page).getByRole('button', { name: /Ajouter une Ligne de 400,00/ })
	).toBeVisible();

	await choisir(page, 'Nature de la ligne 1', 'Trajets');
	await choisir(page, 'Action de la ligne 1', 'Sortie mer');
	// Entrée dans la dernière colonne : une Ligne arrive, prête avec le reste.
	await panneau(page).getByRole('combobox', { name: 'Action de la ligne 1' }).press('Enter');
	const ligne2 = panneau(page).getByLabel('Montant de la ligne 2');
	await expect(ligne2).toBeFocused();
	await expect(ligne2).toHaveValue('400,00');
	await ligne2.fill('250');
	await choisir(page, 'Nature de la ligne 2', 'Trajets');
	await choisir(page, 'Action de la ligne 2', 'Olympiades');

	await panneau(page)
		.getByRole('button', { name: /Ajouter une Ligne de 150,00/ })
		.click();
	const ligne3 = panneau(page).getByLabel('Montant de la ligne 3');
	await expect(ligne3).toBeFocused();
	await ligne3.fill('');
	// `=` insère le reste.
	await ligne3.press('=');
	await expect(ligne3).toHaveValue('150,00');
	await choisir(page, 'Nature de la ligne 3', 'Trajets');
	await choisir(page, 'Action de la ligne 3', 'Sortie ferme');
	await expect(reste).toContainText('Tout est réparti');
	await axeSansViolation(page);

	await panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(panneau(page)).toHaveCount(0);
	await expect(page.locator('tbody tr').filter({ hasText: 'Autocars du Sud' })).toContainText(
		'3 Actions'
	);
});

test('2.3 : un excédent reste ambre, un reste bloque sans rien écrire', async ({ page }) => {
	await page.goto('/operations?op=nouvelle');
	await montant(page).fill('1000');
	await panneau(page).getByLabel('Date').fill('2027-10-11');
	await panneau(page).getByLabel('Libellé').fill('Ne doit pas s’écrire');
	await choisir(page, 'Nature de la ligne 1', 'Trajets');
	const ligne = panneau(page).getByLabel('Montant de la ligne 1');
	const reste = page.getByTestId('reste');

	await ligne.fill('1050');
	await expect(reste).toContainText(/50,00.€ de trop/);
	const couleurs = await reste.evaluate((e) => ({
		fond: getComputedStyle(e).backgroundColor,
		ambre: getComputedStyle(document.documentElement).getPropertyValue('--warning-soft')
	}));
	expect(couleurs.fond).not.toBe('rgba(0, 0, 0, 0)');

	await ligne.fill('600');
	await panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(panneau(page).getByRole('alert')).toContainText(
		/Il reste 400,00.€ à répartir\. Ajoutez une Ligne ou corrigez un montant\./
	);
	await expect(reste).toBeFocused();
	await expect(page).toHaveURL(/op=nouvelle/);
	const b = base();
	const nb = b
		.prepare("SELECT count(*) FROM operation WHERE libelle = 'Ne doit pas s’écrire'")
		.pluck()
		.get();
	b.close();
	expect(nb).toBe(0);
});

test('2.3 : le menu de Ligne ajoute une note, duplique, supprime avec Annuler, change de sens', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations?op=nouvelle');
	await montant(page).fill('100');
	await panneau(page).getByLabel('Date').fill('2027-10-12');
	await panneau(page).getByLabel('Libellé').fill('Facture avec avoir');
	await choisir(page, 'Nature de la ligne 1', 'Trajets');
	const menu = (n: number) =>
		panneau(page).getByRole('button', { name: `Actions de la ligne ${n}` });

	await menu(1).click();
	await panneau(page).getByRole('button', { name: 'Ajouter une note' }).click();
	await panneau(page).getByLabel('Note de la ligne 1').fill('Acompte');

	await menu(1).click();
	await panneau(page).getByRole('button', { name: 'Dupliquer' }).click();
	await expect(panneau(page).getByLabel('Montant de la ligne 2')).toHaveValue('100,00');

	await menu(2).click();
	await panneau(page).getByRole('button', { name: 'Passer en Ligne de recette' }).click();
	await expect(panneau(page).getByText('réduit la dépense')).toBeVisible();
	await panneau(page).getByLabel('Montant de la ligne 1').fill('120');
	await panneau(page).getByLabel('Montant de la ligne 2').fill('20');
	await expect(page.getByTestId('reste')).toContainText('Tout est réparti');

	await menu(2).click();
	await panneau(page).getByRole('button', { name: 'Supprimer' }).click();
	await expect(panneau(page).getByLabel('Montant de la ligne 2')).toHaveCount(0);
	await page.getByRole('button', { name: 'Annuler' }).click();
	await expect(panneau(page).getByLabel('Montant de la ligne 2')).toHaveValue('20,00');

	await panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(panneau(page)).toHaveCount(0);
	const b = base();
	const lignes = b
		.prepare(
			`SELECT l.montant_centimes AS m, l.est_reduction AS r, l.note FROM ligne l
			 JOIN operation o ON o.id = l.operation_id WHERE o.libelle = 'Facture avec avoir' ORDER BY l.ordre`
		)
		.all();
	b.close();
	expect(lignes).toEqual([
		{ m: -12000, r: 0, note: 'Acompte' },
		{ m: 2000, r: 1, note: 'Acompte' }
	]);
});

test('2.3 : le reste s’annonce poliment, une seconde après la frappe', async ({ page }) => {
	await page.goto('/operations?op=nouvelle');
	await montant(page).fill('100');
	const annonce = page.getByTestId('reste').locator('[aria-live=polite]');
	await page.waitForTimeout(1100);
	await panneau(page).getByLabel('Montant de la ligne 1').fill('60');
	await expect(annonce).toHaveText('Tout est réparti');
	await expect(annonce).toHaveText(/Reste à répartir : 40,00/, { timeout: 1500 });
});
