import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { JETONS_V1, preparerInstanceV1 } from './aides-v1.ts';
import { demarrerServeur } from './aides-instance.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';

const PORT = 4195;
const ORIGINE = `http://localhost:${PORT}`;
test.use({ baseURL: ORIGINE });
test.describe.configure({ mode: 'serial' });

let dossier = '';
let serveur: ChildProcess;
let livret = 0;
let courant = 0;
let reserve = 0;

const relevé = (nom: string, date: string, montant: string, libelle: string, solde: string) => ({
	name: nom,
	mimeType: 'application/octet-stream',
	buffer: Buffer.from(
		ofxCp1252(
			ofxTexte([{ date: date.replaceAll('-', ''), montant, libelle, id: nom }], {
				montant: solde,
				date: date.replaceAll('-', '')
			})
		)
	)
});

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-virements-'));
	await preparerInstanceV1(dossier);
	const b = new Database(join(dossier, 'base.sqlite'));
	const exercice = b.prepare("SELECT id FROM exercice WHERE statut = 'ouvert'").pluck().get();
	const compte = (libelle: string, type: string) => {
		const id = Number(
			b.prepare('INSERT INTO compte (libelle, type, ordre) VALUES (?, ?, 60)').run(libelle, type)
				.lastInsertRowid
		);
		b.prepare(
			'INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, 500000)'
		).run(id, exercice);
		return id;
	};
	courant = compte('Banque fictive', 'banque');
	livret = compte('Épargne fictive', 'epargne');
	reserve = compte('Réserve fictive', 'epargne');
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

async function ouvrirEtImporter(
	page: import('@playwright/test').Page,
	compte: number,
	f: ReturnType<typeof relevé>
) {
	await expect(() => page.goto(`/pointage/${compte}`)).toPass();
	await page.waitForLoadState('networkidle');
	const importe = page.waitForResponse(/\/import$/);
	await page.locator('input[type=file]').first().setInputFiles(f);
	await importe;
	await page.waitForLoadState('networkidle');
}

test('un virement sur deux relevés s’enregistre d’un geste, chaque côté à sa date', async ({
	page
}) => {
	await ouvrirEtImporter(
		page,
		livret,
		relevé('livret-1.ofx', '2026-11-04', '-1000.00', 'VIREMENT POUR APE', '4000.00')
	);
	await ouvrirEtImporter(
		page,
		courant,
		relevé('ccp-1.ofx', '2026-11-05', '1000.00', 'VIREMENT DE APE', '6000.00')
	);
	const volet = page.getByRole('region', { name: 'Ligne active' });
	await expect(volet.getByText('Virement depuis Épargne fictive')).toBeVisible();
	await expect(volet.getByText('Aucune Opération ne correspond')).toHaveCount(0);
	await axeSansViolation(page);
	await page.keyboard.press('Enter');
	await expect(page.getByText('Virement enregistré, les deux lignes sont pointées.')).toBeVisible();
	await expect(page.getByText('Tout est pointé')).toBeVisible();

	await expect(() => page.goto(`/pointage/${livret}`)).toPass();
	await expect(page.getByText('Tout est pointé')).toBeVisible();
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const dates = b
		.prepare(
			`SELECT c.date, c.montant_centimes m FROM cote c JOIN operation o ON o.id = c.operation_id
			 WHERE o.genre = 'interne' AND o.libelle LIKE 'Virement de Épargne%' ORDER BY c.id`
		)
		.all();
	b.close();
	expect(dates).toEqual([
		{ date: '2026-11-04', m: -100000 },
		{ date: '2026-11-05', m: 100000 }
	]);
});

test('une date décalée se nomme et se corrige, sans Annuler le Pointage', async ({ page }) => {
	await ouvrirEtImporter(
		page,
		reserve,
		relevé('reserve-1.ofx', '2026-11-04', '-200.00', 'SORTIE FICTIVE', '4800.00')
	);
	const b = new Database(join(dossier, 'base.sqlite'));
	const acces = b.prepare("SELECT id FROM acces WHERE role = 'tresorier'").pluck().get();
	const op = Number(
		b
			.prepare(
				`INSERT INTO operation (genre, date, libelle, cree_le, cree_par)
				 VALUES ('interne', '2026-11-05', 'Virement décalé', '2026-11-05T10:00:00.000Z', ?)`
			)
			.run(acces).lastInsertRowid
	);
	const cote = (compte: number, m: number) =>
		Number(
			b
				.prepare(
					`INSERT INTO cote (operation_id, compte_id, date, montant_centimes) VALUES (?, ?, '2026-11-05', ?)`
				)
				.run(op, compte, m).lastInsertRowid
		);
	const sortant = cote(reserve, -20000);
	cote(courant, 20000);
	const pointage = Number(
		b
			.prepare(
				`INSERT INTO pointage (compte_id, cree_le, cree_par) VALUES (?, '2026-11-05T10:00:00.000Z', ?)`
			)
			.run(reserve, acces).lastInsertRowid
	);
	b.prepare('INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (?, ?)').run(
		pointage,
		sortant
	);
	b.prepare(
		`INSERT INTO pointage_ligne (pointage_id, ligne_releve_id)
		 SELECT ?, id FROM ligne_releve WHERE compte_id = ?`
	).run(pointage, reserve);
	b.close();

	await expect(() => page.goto(`/pointage/${reserve}`)).toPass();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('il reste un Écart de 200,00')).toBeVisible();
	await expect(page.getByText('après le relevé du 04/11/2026').first()).toBeVisible();
	await page.getByRole('button', { name: 'Voir les causes', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Dates à corriger' })).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Mettre au 04/11/2026' }).click();
	await expect(page.getByText('Tout est pointé')).toBeVisible();
	await expect(page.getByText('Date corrigée.')).toBeVisible();
});

test('sur tablette, le virement proposé reste lisible et atteignable', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 900 });
	await ouvrirEtImporter(
		page,
		livret,
		relevé('livret-2.ofx', '2026-11-12', '-50.00', 'VIREMENT VERS BANQUE', '3950.00')
	);
	// L'import réécrit l'adresse après coup : sous WebKit, cela peut interrompre un `goto`.
	await expect(() => page.goto(`/pointage/${courant}`)).toPass();
	await page.waitForLoadState('networkidle');
	const importe = page.waitForResponse(/\/import$/);
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles(relevé('ccp-2.ofx', '2026-11-13', '50.00', 'VIREMENT RECU', '6050.00'));
	await importe;
	await expect(page.getByText('Virement depuis Épargne fictive')).toBeVisible();
	await expect(page.getByRole('button', { name: /Enregistrer le virement/ })).toBeVisible();
	if (process.env.CAPTURES) {
		await page.screenshot({ path: join(process.env.CAPTURES, 'virement-800.png') });
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.screenshot({ path: join(process.env.CAPTURES, 'virement-1280.png') });
	}
	await sansDefilementHorizontal(page);
});
