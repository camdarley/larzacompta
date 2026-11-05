import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import {
	choisir,
	depense,
	enregistrer,
	montant,
	nouvelleDepense,
	operationId,
	panneau
} from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
});

function lire<T>(sql: string, ...p: unknown[]): T[] {
	const b = base();
	const r = b.prepare(sql).all(...p) as T[];
	b.close();
	return r;
}

test('2.7 : une Ligne se rattache à un Exercice antérieur, pas à un suivant', async ({ page }) => {
	await page.goto('/operations?op=nouvelle');
	await depense(page, { libelle: 'Facture tardive', montant: '50', date: '2027-10-20' });
	await panneau(page).getByRole('button', { name: 'Actions de la ligne 1' }).click();
	await panneau(page).getByRole('button', { name: 'Rattacher à un Exercice antérieur' }).click();
	const liste = panneau(page).getByLabel('Exercice de rattachement');
	await expect(liste.getByRole('option')).toHaveText([
		'L’Exercice de l’Opération',
		'2024-2025',
		'2025-2026',
		'2026-2027'
	]);
	await liste.selectOption({ label: '2025-2026' });
	await expect(panneau(page).getByText('Sur 2025-2026')).toBeVisible();
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	await expect(page.getByRole('row', { name: /Facture tardive/ })).toContainText('Sur 2025-2026');

	// L'Exercice clôturé n'est ni modifié, ni recalculé : rien n'y est daté.
	const dates = lire<{ n: number }>(
		`SELECT count(*) AS n FROM operation o JOIN exercice e ON e.libelle = '2025-2026'
		 WHERE o.libelle = 'Facture tardive' AND o.date BETWEEN e.debut AND e.fin`
	);
	expect(dates[0]?.n).toBe(0);
});

test('2.7 : un rattachement non autorisé est refusé par le serveur', async ({ page }) => {
	await page.goto('/operations');
	const compte = lire<{ id: number }>("SELECT id FROM compte WHERE libelle = 'Livret'")[0]?.id;
	const nature = lire<{ id: number }>("SELECT id FROM nature WHERE libelle = 'Trajets'")[0]?.id;
	const r = await page.evaluate(
		([c, n]) =>
			fetch('/api/operations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					forme: 'standard',
					intention: 'depense',
					libelle: 'Rattachement impossible',
					compteId: c,
					date: '2027-10-20',
					montant: 100,
					lignes: [{ montant: 100, natureId: n, exerciceRattachementId: 99999 }]
				})
			}).then((x) => x.json()),
		[compte, nature]
	);
	expect(r.code).toBe('rattachement_invalide');
});

test('2.8 : Entre Comptes : deux Côtés opposés, aucune Ligne, sans Nature', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByRole('button', { name: 'Entre Comptes' }).click();
	await expect(panneau(page).getByText('Ne compte ni en recette, ni en dépense.')).toBeVisible();
	await expect(panneau(page).getByRole('heading', { name: 'Répartir' })).toHaveCount(0);
	await expect(panneau(page).getByRole('combobox', { name: /Nature/ })).toHaveCount(0);
	await axeSansViolation(page);

	await choisir(page, 'De', 'Compte courant');
	await choisir(page, 'Vers', 'Compte courant');
	await montant(page).fill('200');
	await enregistrer(page).click();
	await expect(panneau(page).getByText('Choisissez deux Comptes différents.')).toBeVisible();

	await choisir(page, 'Vers', 'Livret');
	await panneau(page).getByLabel('Parti le').fill('2027-10-21');
	await panneau(page).getByLabel('Arrivé le').fill('2027-10-23');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);

	const rangee = page.getByRole('row', { name: /Virement de Compte courant vers Livret/ });
	await expect(rangee).toContainText('Compte courant vers Livret');
	await expect(rangee).toContainText('Mouvement interne');
	await expect(rangee).toContainText(/200,00.€/);

	const id = operationId('Virement de Compte courant vers Livret');
	expect(
		lire('SELECT date, montant_centimes AS m FROM cote WHERE operation_id = ? ORDER BY id', id)
	).toEqual([
		{ date: '2027-10-21', m: -20000 },
		{ date: '2027-10-23', m: 20000 }
	]);
	expect(lire('SELECT id FROM ligne WHERE operation_id = ?', id)).toEqual([]);
	expect(lire('SELECT date FROM operation WHERE id = ?', id)).toEqual([{ date: '2027-10-21' }]);

	// Il se rouvre et se corrige dans le même formulaire.
	await page.goto(`/operations?op=${id}`);
	await expect(panneau(page).getByRole('combobox', { name: 'Vers' })).toHaveValue('Livret');
	await expect(panneau(page).getByLabel('Arrivé le')).toHaveValue('2027-10-23');
	await panneau(page).getByLabel('Arrivé le').fill('2027-10-22');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	expect(lire('SELECT date FROM cote WHERE operation_id = ? ORDER BY id', id)).toEqual([
		{ date: '2027-10-21' },
		{ date: '2027-10-22' }
	]);
});

test('2.9 : un remboursement reprend Nature et Action, et réduit la dépense', async ({ page }) => {
	await nouvelleDepense(page, {
		libelle: 'Dépense à rembourser',
		montant: '100',
		date: '2027-10-24',
		nature: 'Trajets',
		action: 'Olympiades'
	});
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByRole('button', { name: 'Autre intention' }).click();
	await panneau(page).getByRole('button', { name: 'Remboursement d’un fournisseur' }).click();
	const origine = panneau(page).getByRole('combobox', { name: 'Dépense d’origine' });
	await origine.fill('à rembourser');
	await panneau(page)
		.getByRole('option', { name: /Dépense à rembourser/ })
		.click();
	await expect(panneau(page).getByRole('combobox', { name: 'Nature de la ligne 1' })).toHaveValue(
		'Trajets'
	);
	await expect(panneau(page).getByRole('combobox', { name: 'Action de la ligne 1' })).toHaveValue(
		'Olympiades'
	);
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue(
		'Remboursement Dépense à rembourser'
	);
	await panneau(page).getByLabel('Montant reçu').fill('20');
	await expect(panneau(page).getByText('réduit la dépense')).toBeVisible();
	await panneau(page).getByLabel('Date').fill('2027-10-25');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);

	const id = operationId('Remboursement Dépense à rembourser');
	expect(
		lire('SELECT montant_centimes AS m, est_reduction AS r FROM ligne WHERE operation_id = ?', id)
	).toEqual([{ m: 2000, r: 1 }]);
});

test('2.9 : une somme à rendre, reçue puis rendue, se relie et ne change rien au résultat', async ({
	page
}) => {
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByRole('button', { name: 'Autre intention' }).click();
	await panneau(page).getByRole('button', { name: 'Somme à rendre' }).click();
	await expect(panneau(page).getByRole('heading', { name: 'Répartir' })).toHaveCount(0);
	await montant(page).fill('100');
	await panneau(page).getByLabel('Date').fill('2027-10-26');
	await panneau(page).getByLabel('Libellé').fill('Trop-perçu famille fictive');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);

	const recue = operationId('Trop-perçu famille fictive');
	await page.goto(`/operations?op=${recue}`);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await panneau(page).getByRole('button', { name: 'Rendre cette somme' }).click();
	await expect(page).toHaveURL(/rendre=\d+/);
	await expect(montant(page).or(panneau(page).getByLabel('Montant rendu'))).toHaveValue('100,00');
	await panneau(page).getByLabel('Date').fill('2027-10-27');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);

	const rendue = operationId('Rendu : Trop-perçu famille fictive');
	expect(
		lire(
			`SELECT o.genre, c.montant_centimes AS cote, l.montant_centimes AS ligne, n.neutre, li.type
			 FROM operation o JOIN cote c ON c.operation_id = o.id JOIN ligne l ON l.operation_id = o.id
			 JOIN nature n ON n.id = l.nature_id JOIN liaison li ON li.id = o.liaison_id
			 WHERE o.id IN (?, ?) ORDER BY o.id`,
			recue,
			rendue
		)
	).toEqual([
		{ genre: 'standard', cote: 10000, ligne: 10000, neutre: 1, type: 'somme_a_rendre' },
		{ genre: 'standard', cote: -10000, ligne: -10000, neutre: 1, type: 'somme_a_rendre' }
	]);

	// Tout est rendu : l'action disparaît.
	await page.goto(`/operations?op=${recue}`);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await expect(panneau(page).getByRole('button', { name: 'Rendre cette somme' })).toHaveCount(0);
});

async function compensee(page: import('@playwright/test').Page, libelle: string, ventes: string) {
	await page.goto('/operations?op=nouvelle');
	await panneau(page).getByRole('button', { name: 'Autre intention' }).click();
	await panneau(page).getByRole('button', { name: 'Opération compensée' }).click();
	await panneau(page).getByLabel('Fournisseur', { exact: true }).fill(libelle);
	await panneau(page).getByLabel('Date').fill('2027-10-28');
	await panneau(page).getByLabel('Facture totale').fill('500');
	await panneau(page).getByLabel('Ventes encaissées par le fournisseur').fill(ventes);
	await choisir(page, 'Nature de la facture', 'Cachets');
	await choisir(page, 'Nature des ventes', 'Papeterie');
}

test('2.10 : facture, ventes et différentiel : une Ligne de chaque, un seul Côté', async ({
	page
}) => {
	await compensee(page, 'Photographe imaginaire', '300');
	const pose = panneau(page).getByRole('img', { name: /Facture/ });
	await expect(pose).toHaveAttribute(
		'aria-label',
		/Facture 500 euros, moins Ventes encaissées 300 euros, égale Différentiel 200 euros/
	);
	await expect(
		panneau(page).getByText(/Seul le différentiel de 200,00.€ touche le Compte\./)
	).toBeVisible();
	await axeSansViolation(page);
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	const id = operationId('Photographe imaginaire');
	expect(
		lire('SELECT montant_centimes AS m FROM ligne WHERE operation_id = ? ORDER BY ordre', id)
	).toEqual([{ m: 30000 }, { m: -50000 }]);
	expect(lire('SELECT montant_centimes AS m FROM cote WHERE operation_id = ?', id)).toEqual([
		{ m: -20000 }
	]);
});

test('2.10 : un différentiel nul ne touche aucun Compte, des ventes supérieures font entrer', async ({
	page
}) => {
	await compensee(page, 'Compensation exacte', '500');
	await expect(panneau(page).getByText('Aucun mouvement sur le Compte')).toBeVisible();
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	const nul = operationId('Compensation exacte');
	expect(lire('SELECT id FROM cote WHERE operation_id = ?', nul)).toEqual([]);
	await expect(page.getByRole('row', { name: /Compensation exacte/ })).toContainText(
		'Aucun Compte'
	);

	await compensee(page, 'Ventes supérieures', '600');
	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	const haut = operationId('Ventes supérieures');
	expect(lire('SELECT montant_centimes AS m FROM cote WHERE operation_id = ?', haut)).toEqual([
		{ m: 10000 }
	]);
});

test('2.11 : relier deux paiements affiche le total, délier le recalcule', async ({ page }) => {
	await nouvelleDepense(page, {
		libelle: 'Cachet artiste',
		montant: '220',
		date: '2027-10-29',
		nature: 'Cachets'
	});
	await nouvelleDepense(page, {
		libelle: 'Cotisations artiste',
		montant: '180',
		date: '2027-10-30',
		nature: 'Cachets'
	});
	const [a, b] = [operationId('Cachet artiste'), operationId('Cotisations artiste')];
	const lignesAvant = lire('SELECT * FROM ligne WHERE operation_id IN (?, ?) ORDER BY id', a, b);

	await page.goto(`/operations?op=${a}`, { waitUntil: 'networkidle' });
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await panneau(page).getByRole('button', { name: 'Relier à une autre Opération' }).click();
	const cible = panneau(page).getByRole('combobox', { name: 'Opération à relier' });
	await expect(cible).toBeFocused();
	await expect(cible).toBeInViewport();
	await cible.fill('cotisations');
	await panneau(page)
		.getByRole('option', { name: /Cotisations artiste/ })
		.click();
	await panneau(page).getByLabel('Nom de la dépense').fill('Spectacle');
	await axeSansViolation(page);
	await panneau(page).getByRole('button', { name: 'Relier', exact: true }).click();

	const phrase = panneau(page).getByText(
		/Fait partie de : Spectacle, 400,00.€ au total, 220 \+ 180/
	);
	await expect(phrase).toBeVisible();
	await page.goto(`/operations?op=${b}`);
	await expect(phrase).toBeVisible();

	await panneau(page).getByRole('button', { name: 'Délier cette Opération' }).click();
	await expect(phrase).toHaveCount(0);
	await page.goto(`/operations?op=${a}`);
	await expect(panneau(page).getByText('Fait partie de')).toHaveCount(0);
	expect(lire('SELECT * FROM ligne WHERE operation_id IN (?, ?) ORDER BY id', a, b)).toEqual(
		lignesAvant
	);
});

test('2.11 : une liaison s’enregistre sur un Exercice clôturé, sans le changer', async ({
	page
}) => {
	await nouvelleDepense(page, {
		libelle: 'Cotisations d’octobre',
		montant: '60',
		date: '2027-10-05',
		nature: 'Cachets'
	});
	const clos = operationId('Autocars de mars');
	const avant = lire('SELECT * FROM cote WHERE operation_id = ?', clos);
	await page.goto(`/operations?exercice=2025-2026&op=${clos}`);
	await panneau(page).getByRole('button', { name: 'Actions de l’Opération' }).click();
	await panneau(page).getByRole('button', { name: 'Relier à une autre Opération' }).click();
	const cible = panneau(page).getByRole('combobox', { name: 'Opération à relier' });
	await cible.fill('octobre');
	await panneau(page)
		.getByRole('option', { name: /Cotisations d’octobre/ })
		.click();
	await panneau(page).getByRole('button', { name: 'Relier', exact: true }).click();
	await expect(panneau(page).getByText(/Fait partie de : Autocars de mars/)).toBeVisible();
	expect(lire('SELECT * FROM cote WHERE operation_id = ?', clos)).toEqual(avant);
});

test('les formes restent lisibles à 320 px', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	for (const q of ['intention=interne', 'intention=compensee', 'intention=somme']) {
		await page.goto(`/operations?op=nouvelle&${q}`);
		await page.waitForTimeout(250);
		expect(await sansDefilementHorizontal(page)).toBe(true);
		await axeSansViolation(page);
	}
});
