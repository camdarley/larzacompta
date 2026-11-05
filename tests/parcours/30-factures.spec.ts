/**
 * Epic 9 : une Facture de bout en bout, du brouillon à l'Avoir, en passant par le Pointage.
 * Avec `CAPTURES=<dossier>`, chaque écran laisse ses captures clair et sombre, à regarder à l'œil.
 */
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { chargerDansDossier, type JeuCharge } from '../jeux/charger.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { demarrerServeur } from './aides-instance.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { choisir, panneau } from './aides-operations.ts';

const PORT = 4191;
const ORIGINE = `http://localhost:${PORT}`;
const captures = process.env.CAPTURES;
const JETONS = { tresorier: 'session-fictive-factures', lecteur: 'session-fictive-lecture' };

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuCharge;

function preparer(d: string) {
	const j = chargerDansDossier(d);
	const base = ouvrirBase(join(d, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(d, 'fichiers')) });
	const depots = app.socle.depots;
	const maintenant = new Date().toISOString();
	const demain = new Date(Date.now() + 86_400_000).toISOString();
	for (const [jeton, role] of [
		[JETONS.tresorier, 'tresorier'],
		[JETONS.lecteur, 'lecteur']
	] as const) {
		const acces = depots.acces.lister().find((a) => a.role === role)!;
		depots.acces.creerSession({
			hashJeton: createHash('sha256').update(jeton).digest('hex'),
			accesId: acces.id,
			creeLe: maintenant,
			derniereActiviteLe: maintenant,
			expireLe: demain
		});
	}
	base.close();
	return j;
}

async function connecte(page: Page, role: keyof typeof JETONS = 'tresorier') {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

const photo = async (page: Page, nom: string) => {
	if (!captures) return;
	await page.waitForTimeout(350);
	await page.screenshot({ path: join(captures, `${nom}.png`), fullPage: true });
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.waitForTimeout(350);
	await page.screenshot({ path: join(captures, `${nom}-sombre.png`), fullPage: true });
	await page.emulateMedia({ colorScheme: 'light' });
};

function lireBase<T>(sql: string, ...args: unknown[]): T[] {
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const r = base.prepare(sql).all(...args) as T[];
	base.close();
	return r;
}

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-factures-'));
	jeu = preparer(dossier);
	serveur = await demarrerServeur(dossier, PORT);
	if (captures) mkdirSync(captures, { recursive: true });
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function remplir(page: Page, tiers: string, prix: string) {
	await page.goto('/factures/nouvelle');
	await page.getByLabel('Tiers').fill(tiers);
	await page.getByLabel('Adresse', { exact: true }).fill('1 rue Fictive\n00000 Ailleurs');
	await page.getByLabel('Désignation, ligne 1').fill('Repas de novembre');
	await page.getByLabel('Quantité, ligne 1').fill('120');
	await page.getByLabel('Prix unitaire, ligne 1').fill('3,50');
	await page.getByRole('button', { name: 'Ajouter une ligne' }).click();
	await expect(page.getByLabel('Désignation, ligne 2')).toBeFocused();
	await page.getByLabel('Désignation, ligne 2').fill('Goûters');
	await page.getByLabel('Prix unitaire, ligne 2').fill(prix);
}

test.describe('sur ordinateur', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('Factures vides : l’état prévu, et son action', async ({ page }) => {
		await connecte(page);
		await page.goto('/factures');
		await expect(page.getByRole('heading', { name: 'Aucune Facture émise' })).toBeVisible();
		await expect(
			page.getByText('Produisez une facture pour un tiers, par exemple la cantine.')
		).toBeVisible();
		await axeSansViolation(page);
		await photo(page, 'factures-vide');
		await page.getByRole('link', { name: 'Nouvelle facture' }).last().click();
		await expect(page).toHaveURL(/factures\/nouvelle/);
	});

	test('Réglages : les mentions sont vides, modifiables, avec le rappel', async ({ page }) => {
		await connecte(page);
		await page.goto('/reglages');
		const zone = page.getByLabel('Mentions de facture');
		await expect(zone).toHaveValue('');
		await expect(page.getByText('À vérifier selon la situation de votre APE')).toBeVisible();
		await zone.fill('Association loi 1901, mention fictive.\nPaiement à réception.');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.getByText('Enregistré.')).toBeVisible();
		await photo(page, 'reglages-mentions');
	});

	test('brouillon : aperçu à droite, sans numéro, sans rien compter', async ({ page }) => {
		await connecte(page);
		await remplir(page, 'Cantine fictive', '100');
		await choisir_action(page);
		await expect(page.getByText('520,00 €')).toBeVisible();
		await expect(page.locator('iframe[title="Aperçu de la facture"]')).toBeAttached();
		await expect(lireBase('SELECT id FROM facture')).toEqual([]);
		await axeSansViolation(page);
		await photo(page, 'facture-nouvelle');
		await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
		await expect(page).toHaveURL(/factures\/\d+$/);
		await expect(
			page.getByRole('heading', { name: 'Brouillon pour Cantine fictive' })
		).toBeVisible();
		expect(lireBase('SELECT numero FROM facture')).toEqual([{ numero: null }]);
		expect(lireBase(`SELECT id FROM creance_dette WHERE facture_id IS NOT NULL`)).toEqual([]);
	});

	test('quitter sans enregistrer se demande, garder reste possible', async ({ page }) => {
		await connecte(page);
		await page.goto('/factures');
		await page.getByRole('link', { name: /brouillon pour Cantine fictive/ }).click();
		await page.getByLabel('Tiers').fill('Cantine fictive du lycée');
		await page.getByRole('link', { name: 'Toutes les Factures' }).first().click();
		const d = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });
		await d.getByRole('button', { name: 'Rester' }).click();
		await expect(page.getByLabel('Tiers')).toHaveValue('Cantine fictive du lycée');
		await page.getByLabel('Tiers').fill('Cantine fictive');
		await page.getByRole('link', { name: 'Toutes les Factures' }).first().click();
		await expect(page).toHaveURL(/\/factures$/);
	});

	test('valider : le dialogue dit le numéro, la Créance apparaît', async ({ page }) => {
		await connecte(page);
		await page.goto('/factures');
		await axeSansViolation(page);
		await page.getByRole('link', { name: /brouillon pour Cantine fictive/ }).click();
		await page.getByRole('button', { name: 'Valider…' }).click();
		const annee = new Date().getFullYear();
		const d = page.getByRole('dialog', { name: 'Valider cette facture ?' });
		await expect(d).toContainText(`Elle recevra le n° ${annee}-001 et ne sera plus modifiable.`);
		await expect(d).toContainText('520,00');
		await photo(page, 'facture-dialogue');
		await d.getByRole('button', { name: 'Valider la facture' }).click();
		await expect(page.getByRole('heading', { name: `Facture n° ${annee}-001` })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Créer un Avoir' })).toBeVisible();
		await axeSansViolation(page);
		await photo(page, 'facture-validee');

		const pdf = await page.request.get(page.url() + '/pdf');
		if (captures) writeFileSync(join(captures, 'facture.pdf'), await pdf.body());
		expect(pdf.headers()['content-type']).toBe('application/pdf');
		const encore = await page.request.get(page.url() + '/pdf');
		expect(await encore.body()).toEqual(await pdf.body());

		await page.goto('/creances-dettes');
		const rangee = page.getByRole('row', { name: /Cantine fictive/ });
		await expect(rangee).toContainText(`Facture n° ${annee}-001`);
		await expect(rangee).toContainText('520,00');
		await expect(rangee.getByRole('button', { name: /Actions de/ })).toHaveCount(0);
		await photo(page, 'creance-de-facture');

		await page.goto('/factures');
		await expect(page.getByRole('row', { name: /Cantine fictive/ })).toContainText('Validée');
		await photo(page, 'factures-liste');
	});

	test('une date antérieure à la dernière émise se refuse sur son champ', async ({ page }) => {
		await connecte(page);
		await remplir(page, 'Mairie fictive', '10');
		await page.getByLabel('Date d’émission').fill(`${new Date().getFullYear()}-09-02`);
		await page.getByRole('button', { name: 'Valider…' }).click();
		await expect(
			page.getByText('Cette date précède celle de la dernière Facture émise')
		).toBeVisible();
		await photo(page, 'facture-date-refusee');
	});

	test('le Pointage signale la Créance, Créer et solder la règle et pointe', async ({ page }) => {
		const annee = new Date().getFullYear();
		const base = ouvrirBase(join(dossier, 'base.sqlite'));
		const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });
		const tresorier = app.socle.depots.acces.lister().find((a) => a.role === 'tresorier')!;
		const ctx = app.ctx(app.socle.depots.acces.parId(tresorier.id));
		const date = ctx.aujourdhui.replaceAll('-', '');
		const lu = app.pointage.importer(ctx, {
			compteId: jeu.banque,
			nomFichier: 'fictif.ofx',
			octets: ofxCp1252(
				ofxTexte(
					[{ date, montant: '520.00', id: 'F1', libelle: `VIR CANTINE FACT ${annee}-001` }],
					null
				)
			)
		});
		base.close();
		expect(lu.ok).toBe(true);

		await connecte(page);
		await page.goto(`/pointage/${jeu.banque}`);
		await page.locator('[data-ligne]', { hasText: `VIR CANTINE FACT ${annee}-001` }).click();
		const volet = page.getByRole('region', { name: 'Ligne active' });
		await expect(volet.getByText('Créance ouverte')).toBeVisible();
		await expect(volet).toContainText('Même montant, n° de facture lu dans le libellé');
		await photo(page, 'pointage-creance');
		await volet.getByRole('button', { name: 'Créer et solder' }).click();

		const p = panneau(page);
		await expect(p.getByText('Cette Opération solde')).toBeVisible();
		await expect(p.getByLabel('Montant', { exact: true })).toHaveValue(/520,00/);
		await expect(p.getByLabel('Référence')).toHaveValue(`${annee}-001`);
		await photo(page, 'pointage-solder');
		await choisir(page, 'Nature de la ligne 1', 'Cotisations');
		await p.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
		await expect(page.getByText('Pointé.')).toBeVisible();

		expect(
			lireBase<{ montant_centimes: number }>(
				'SELECT r.montant_centimes FROM reglement r JOIN creance_dette c ON c.id = r.creance_dette_id WHERE c.facture_id IS NOT NULL'
			)
		).toEqual([{ montant_centimes: 52000 }]);

		await page.goto('/factures');
		await expect(page.getByRole('row', { name: /Cantine fictive/ })).toContainText('encaissée');
	});

	test('Avoir sur une Facture encaissée : aperçu, confirmation, Dette', async ({ page }) => {
		const annee = new Date().getFullYear();
		await connecte(page);
		await page.goto('/factures');
		await page.getByRole('link', { name: `${annee}-001` }).click();
		await page.getByRole('link', { name: 'Créer un Avoir' }).click();
		await expect(page).toHaveURL(/avoir$/);
		await expect(page.getByText('une Dette de ce montant s’ouvre')).toBeVisible();
		await axeSansViolation(page);
		await photo(page, 'avoir-apercu');
		if (captures) {
			const apercu = await page.request.get(page.url() + '/apercu');
			writeFileSync(join(captures, 'avoir-apercu.pdf'), await apercu.body());
		}
		await page.getByRole('button', { name: 'Créer l’Avoir…' }).click();
		const d = page.getByRole('dialog', { name: 'Créer cet Avoir ?' });
		await expect(d).toContainText(`Il recevra le n° ${annee}-002`);
		await d.getByRole('button', { name: 'Créer l’Avoir' }).click();
		await expect(page.getByRole('heading', { name: `Avoir n° ${annee}-002` })).toBeVisible();
		await photo(page, 'avoir-valide');

		await page.goto('/creances-dettes');
		await expect(page.getByRole('region', { name: 'À payer' })).toContainText(
			`Avoir n° ${annee}-002`
		);
		await page.goto('/factures');
		await expect(page.getByRole('row', { name: new RegExp(`^${annee}-001`) })).toContainText(
			'Annulée'
		);
		await photo(page, 'factures-avoir');
	});

	test('un·e lecteur·rice ne voit pas les Factures', async ({ page }) => {
		await connecte(page, 'lecteur');
		await page.goto('/creances-dettes');
		await expect(page.getByRole('link', { name: 'Factures' })).toHaveCount(0);
		const r = await page.goto('/factures');
		expect(r?.status()).toBe(403);
	});
});

test.describe('relevé démesuré déjà en base', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('Tableau de contrôle et Pointage répondent, et le bouton de sortie retire tout', async ({
		page
	}) => {
		const base = ouvrirBase(join(dossier, 'base.sqlite'));
		base
			.prepare(
				`INSERT INTO ligne_releve (compte_id, date, montant_centimes, libelle, empreinte, cree_le)
				 VALUES (?, '2026-10-01', ?, 'COLONNE MAL CHOISIE', 'e-demesure', '2026-10-02T10:00:00.000Z')`
			)
			.run(jeu.banque, 9_000_000_000_000_000_000n);
		base.close();

		await connecte(page);
		const accueil = await page.goto('/');
		expect(accueil?.status()).toBe(200);
		await expect(page.getByText('Un relevé porte un montant démesuré')).toBeVisible();
		await photo(page, 'demesure-tableau');
		await page.getByRole('link', { name: 'Ouvrir le Pointage' }).click();
		await expect(page.getByText('« COLONNE MAL CHOISIE »')).toBeVisible();
		await axeSansViolation(page);
		await photo(page, 'demesure-pointage');
		await page.getByRole('button', { name: 'Retirer cette ligne' }).click();
		await expect(page.getByText('Retiré du relevé.')).toBeVisible();
		await expect(page.getByText('COLONNE MAL CHOISIE')).toHaveCount(0);
		await page.goto('/');
		await expect(page.getByText('Un relevé porte un montant démesuré')).toHaveCount(0);
	});
});

test.describe('sur téléphone', () => {
	test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

	test('liste et fiche se consultent, rien ne se travaille', async ({ page }) => {
		await connecte(page);
		await page.goto('/factures');
		await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Nouvelle facture' })).toBeHidden();
		expect(await sansDefilementHorizontal(page)).toBe(true);
		await axeSansViolation(page);
		await photo(page, 'telephone-factures');
		await page
			.getByRole('link', { name: /^\d{4}-\d{3}$/ })
			.first()
			.click();
		await expect(page.getByRole('link', { name: 'Télécharger' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Créer un Avoir' })).toBeHidden();
		expect(await sansDefilementHorizontal(page)).toBe(true);
		await photo(page, 'telephone-facture');
		await page.goto('/factures/nouvelle');
		await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeVisible();
		await expect(page.getByLabel('Tiers')).toBeHidden();
		await photo(page, 'telephone-nouvelle');
	});
});

async function choisir_action(page: Page) {
	const champ = page.getByRole('combobox', { name: 'Action' });
	await champ.click();
	await page.getByRole('option').first().click();
}
