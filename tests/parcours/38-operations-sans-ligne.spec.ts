import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { axeSansViolation } from './aides.ts';
import { JETONS_V1, preparerInstanceV1 } from './aides-v1.ts';
import { demarrerServeur } from './aides-instance.ts';

/**
 * Retour d'usage du 07/11/2026 : un Livret sans relevé importé laissait ses Opérations
 * introuvables au Pointage. Elles s'y listent, et leur ligne se recopie depuis le relevé papier.
 */
const PORT = 4196;
const ORIGINE = `http://localhost:${PORT}`;
test.use({ baseURL: ORIGINE });
test.describe.configure({ mode: 'serial' });

let dossier = '';
let serveur: ChildProcess;
let livret = 0;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-sans-ligne-'));
	await preparerInstanceV1(dossier);
	const b = new Database(join(dossier, 'base.sqlite'));
	const exercice = b.prepare("SELECT id FROM exercice WHERE statut = 'ouvert'").pluck().get();
	const debut = b
		.prepare("SELECT debut FROM exercice WHERE statut = 'ouvert'")
		.pluck()
		.get() as string;
	livret = Number(
		b
			.prepare(
				"INSERT INTO compte (libelle, type, ordre) VALUES ('Épargne fictive', 'epargne', 60)"
			)
			.run().lastInsertRowid
	);
	b.prepare(
		'INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, 500000)'
	).run(livret, exercice);
	const acces = b.prepare('SELECT id FROM acces ORDER BY id LIMIT 1').pluck().get();
	const nature = b
		.prepare('SELECT id FROM nature WHERE code_systeme IS NULL ORDER BY id LIMIT 1')
		.pluck()
		.get();
	const date = debut.replace(/-\d\d$/, '-15');
	const op = Number(
		b
			.prepare(
				`INSERT INTO operation (genre, origine, date, libelle, mode_paiement, version, cree_le, cree_par)
				 VALUES ('standard', 'saisie', ?, 'Intérêts fictifs', 'virement', 1, ?, ?)`
			)
			.run(date, `${date}T10:00:00.000Z`, acces).lastInsertRowid
	);
	b.prepare(
		'INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (?, ?, ?, 21437)'
	).run(op, livret, date);
	b.prepare(
		`INSERT INTO ligne (operation_id, ordre, montant_centimes, est_reduction, nature_id, exercice_rattachement_id)
		 VALUES (?, 1, 21437, 0, ?, ?)`
	).run(op, nature, exercice);
	b.close();
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

test.beforeEach(async ({ context, page }) => {
	await context.addCookies([{ name: 'ape_session', value: JETONS_V1.tresorier, url: ORIGINE }]);
	await page.setViewportSize({ width: 1280, height: 900 });
});

test('une Opération sans ligne se recopie du relevé, puis se pointe', async ({ page }) => {
	await expect(() => page.goto(`/pointage/${livret}`)).toPass();
	const section = page.getByRole('region', { name: 'Une Opération attend sa ligne de relevé' });
	await expect(section).toBeVisible();
	await expect(section.getByText('Intérêts fictifs')).toBeVisible();
	await axeSansViolation(page);

	await section.getByRole('button', { name: 'Recopier du relevé' }).click();
	const panneau = page.getByRole('dialog', { name: 'Saisir une ligne' });
	await expect(panneau.getByLabel('Libellé')).toHaveValue('Intérêts fictifs');
	await expect(panneau.getByLabel('Montant')).toHaveValue(/214,37/);
	await expect(panneau.getByRole('button', { name: 'Entrée' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await panneau.getByRole('button', { name: 'Ajouter la ligne' }).click();
	await expect(page.getByText('Ligne ajoutée.')).toBeVisible();

	await page.getByRole('button', { name: /^Pointer/ }).click();
	await expect(section).toBeHidden();
});
