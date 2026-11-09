import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { axeSansViolation } from './aides.ts';
import { JETONS_V1, preparerInstanceV1 } from './aides-v1.ts';
import { demarrerServeur } from './aides-instance.ts';
import { choisir, enregistrer, panneau } from './aides-operations.ts';

/**
 * Retour d'usage du 09/11/2026 : la facture du transport du Cross arrive le 31/10, elle est payée
 * le 09/11. Elle se joint à la Dette, puis suit le paiement.
 */
const PORT = 4198;
const ORIGINE = `http://localhost:${PORT}`;
test.use({ baseURL: ORIGINE });
test.describe.configure({ mode: 'serial' });

let dossier = '';
let serveur: ChildProcess;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-pieces-sommes-'));
	await preparerInstanceV1(dossier);
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

const pdf = (nom: string) => ({
	name: nom,
	mimeType: 'application/pdf',
	buffer: Buffer.from(`%PDF-1.4\n%${nom}\n`)
});
const zoneDepot = (page: Page) => panneau(page).locator('input[type=file]').first();
const aPayer = (page: Page) => page.getByRole('region', { name: 'À payer' });

async function ajouterDette(page: Page, tiers: string, motif: string, fichier?: string) {
	await expect(() => page.goto('/creances-dettes?ajout=dette')).toPass();
	await panneau(page).getByLabel('Sens').selectOption('dette');
	await panneau(page).getByLabel('Tiers').fill(tiers);
	await panneau(page).getByLabel('Motif').fill(motif);
	await panneau(page).getByLabel('Montant').fill('180');
	if (fichier) {
		await zoneDepot(page).setInputFiles(pdf(fichier));
		await expect(panneau(page).getByText(fichier, { exact: true })).toBeVisible();
	}
	await panneau(page).getByRole('button', { name: 'Enregistrer' }).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });
}

test('la facture se joint à la Dette, puis au paiement qui la solde', async ({ page }) => {
	await ajouterDette(page, 'Autocars fictifs', 'Transport du Cross', 'facture-cross.pdf');
	const rangee = aPayer(page).getByRole('row', { name: /Autocars fictifs/ });
	await expect(rangee.getByRole('link', { name: /Pièces de Autocars fictifs/ })).toBeVisible();
	await expect(rangee).not.toContainText('Sans Pièce');
	await axeSansViolation(page);

	await rangee.getByRole('link', { name: 'Solder' }).click();
	await expect(panneau(page).getByText('facture-cross.pdf', { exact: true })).toBeVisible();
	await expect(
		panneau(page).getByText('Pièce de la somme soldée, jointe avec l’Opération')
	).toBeVisible();
	await expect(panneau(page).getByText('Pas besoin de Pièce')).toHaveCount(0);
	await choisir(page, 'Nature de la ligne 1', 'Fournitures');
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });

	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const jointe = b
		.prepare(
			`SELECT p.nom_original FROM piece_operation po JOIN piece p ON p.id = po.piece_id
			 JOIN reglement r ON r.operation_id = po.operation_id`
		)
		.pluck()
		.all();
	b.close();
	expect(jointe).toEqual(['facture-cross.pdf']);
});

test('une Dette sans Pièce se signale, et la reçoit depuis sa rangée', async ({ page }) => {
	await ajouterDette(page, 'Imprimerie fictive', 'Affiches de la Kermesse');
	const rangee = aPayer(page).getByRole('row', { name: /Imprimerie fictive/ });
	await expect(rangee.getByText('Sans Pièce')).toBeVisible();

	await rangee.getByRole('link', { name: /joindre la Pièce de Imprimerie fictive/ }).click();
	await expect(panneau(page)).toBeVisible();
	await axeSansViolation(page);
	await zoneDepot(page).setInputFiles(pdf('facture-affiches.pdf'));
	await expect(page.getByText('Pièce jointe.')).toBeVisible();
	await expect(panneau(page).getByText('facture-affiches.pdf', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(rangee).not.toContainText('Sans Pièce');
});
