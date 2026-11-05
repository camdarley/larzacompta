/**
 * Parties J1 de UJ-1 et UJ-4, flux de reprise FR-40, et un test axe par écran à 320 px,
 * sur le serveur construit, chargé avec l'Exercice fictif complet (story 6.7).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { chargerDansDossier, COMPTES_FICTIFS, type JeuCharge } from '../jeux/charger.ts';
import { ofxCp1252, ofxTexte, type LigneOfx } from '../jeux/releve-fictif.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { panneau } from './aides-operations.ts';

const PORT = 4176;
const PORT_NEUF = 4177;
const ORIGINE = `http://localhost:${PORT}`;
const ORIGINE_NEUVE = `http://localhost:${PORT_NEUF}`;

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
const envServeur = (dossier: string, port: number) => ({
	...process.env,
	APE_DONNEES: dossier,
	ORIGIN: `http://localhost:${port}`,
	PROTOCOL_HEADER: 'x-forwarded-proto',
	BODY_SIZE_LIMIT: '25M',
	PORT: String(port),
	HOST: '127.0.0.1',
	TZ: 'Europe/Paris'
});

async function demarrer(dossier: string, port: number) {
	const serveur = spawn('node', ['build/index.js'], {
		stdio: 'ignore',
		env: envServeur(dossier, port)
	});
	for (let i = 0; i < 100; i++) {
		if ((await fetch(`http://localhost:${port}/sante`).catch(() => null))?.ok) return serveur;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('Le serveur ne répond pas.');
}

let dossier: string;
let dossierNeuf: string;
let serveur: ChildProcess;
let serveurNeuf: ChildProcess;
let jeu: JeuCharge;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-jalon-'));
	dossierNeuf = mkdtempSync(join(tmpdir(), 'ape-compta-reprise-'));
	jeu = chargerDansDossier(dossier);
	serveur = await demarrer(dossier, PORT);
	serveurNeuf = await demarrer(dossierNeuf, PORT_NEUF);
});

test.afterAll(() => {
	serveur.kill();
	serveurNeuf.kill();
	rmSync(dossier, { recursive: true, force: true });
	rmSync(dossierNeuf, { recursive: true, force: true });
});

async function connecter(page: Page, a: { identifiant: string; motDePasse: string }, origine = '') {
	await page.goto(`${origine}/connexion`);
	await page.getByLabel('Identifiant').fill(a.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(a.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);
}

const fichier = (lignes: LigneOfx[], solde: { montant: string; date: string }, nom: string) => ({
	name: nom,
	mimeType: 'application/octet-stream',
	buffer: Buffer.from(ofxCp1252(ofxTexte(lignes, solde)))
});

async function deposer(page: Page, f: Parameters<Page['setInputFiles']>[1]) {
	await page.waitForLoadState('networkidle');
	await page.locator('input[type=file]').first().setInputFiles(f);
}

const ligne = (page: Page, libelle: string) =>
	page.getByRole('button', { name: new RegExp(`^${libelle}`) });
const barre = (page: Page) => page.getByRole('region', { name: 'Écart du relevé' });

test('UJ-1 : Camille pointe le mois jusqu’à l’Écart nul', async ({ page }) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('à regarder');
	await page.goto(`/pointage/${jeu.banque}`);
	await expect(barre(page)).toContainText('2 337,00'.replace(' ', ' '));

	// Une Ligne déjà connue, une Opération du cahier, un virement inconnu.
	await deposer(
		page,
		fichier(
			[
				{ date: '20261102', montant: '-3.50', id: 'FICTIF9999', libelle: 'FRAIS TENUE DE COMPTE' },
				{
					date: '20261103',
					montant: '-200.00',
					id: 'FICTIF0100',
					libelle: 'PHOTOGRAPHE IMAGINAIRE'
				},
				{ date: '20261104', montant: '65.00', id: 'FICTIF0101', libelle: 'VIR FAMILLE IMAGINAIRE' }
			],
			{ montant: '2202.00', date: '20261104' },
			'novembre.ofx'
		)
	);
	await expect(page.getByText('3 lignes lues, 2 nouvelles, 1 déjà connue.')).toBeVisible();

	// La proposition dit pourquoi, Camille valide.
	await ligne(page, 'PHOTOGRAPHE IMAGINAIRE').click();
	const volet = page.getByRole('region', { name: 'Ligne active' });
	await expect(volet.locator('.proposition')).toContainText('Photographe imaginaire');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Pointé.')).toBeVisible();

	// Le frais et le virement inconnu se créent depuis leur Ligne, et se ventilent.
	for (const [libelle, nature] of [
		['FRAIS TENUE', 'Fournitures'],
		['VIR FAMILLE', 'Cotisations']
	] as const) {
		await ligne(page, libelle).click();
		await page.keyboard.press('c');
		const d = panneau(page);
		const champ = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
		await champ.fill(nature);
		await champ.press('Enter');
		await d.getByLabel('Libellé').press('Control+Enter');
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}

	// Le solde calculé égale celui du relevé : le mois est pointé.
	await expect(barre(page)).toContainText('2 202,00'.replace(' ', ' '));
	await expect(barre(page)).toContainText('Écart nul');
	await expect(barre(page)).toContainText('10 sur 10');
	await page.goto('/');
	await expect(page.getByRole('main')).toContainText('Égal au relevé');
});

test('UJ-4 : Alex reprend la trésorerie sans rien se faire expliquer', async ({
	page,
	browser
}) => {
	await connecter(page, COMPTES_FICTIFS.tresorier);
	await page.goto('/reglages/acces?acces=nouveau');
	await page.getByLabel('Identifiant').fill('alex');
	await page.getByLabel('Nom affiché').fill('Alex Fictif');
	await page.getByRole('button', { name: 'Créer l’Accès' }).click();
	const lien = (await page.locator('code').textContent()) as string;

	const contexte = await browser.newContext({
		baseURL: ORIGINE,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	});
	const alex = await contexte.newPage();
	await alex.goto(lien);
	await alex.getByLabel('Mot de passe').fill('le cahier passe de main');
	await alex.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(alex).toHaveURL(/\/$/);

	// L'historique et le paramétrage.
	await alex.getByRole('link', { name: 'Journal' }).click();
	await expect(alex.getByRole('main')).toContainText('Camille Fictive');
	await alex.goto('/reglages/comptes');
	await expect(alex.getByRole('main')).toContainText('Banque des Tilleuls');

	// Ce qui reste dû.
	await alex.goto('/creances-dettes');
	await expect(alex.getByRole('main')).toContainText('Imprimerie imaginaire');
	await expect(alex.getByRole('main')).toContainText('90,00');

	// Sa première Opération, sans explication.
	await alex.goto('/operations?op=nouvelle');
	const d = panneau(alex);
	await d.getByLabel('Montant', { exact: true }).fill('12,30');
	await d.getByLabel('Date').fill('2026-11-05');
	await d.getByLabel('Libellé').fill('Timbres');
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.fill('Fournitures');
	await nature.press('Enter');
	await d.getByRole('button', { name: 'Enregistrer', exact: false }).first().click();
	await expect(alex.getByRole('dialog')).toHaveCount(0);
	await expect(alex.getByRole('main')).toContainText('Timbres');
	await contexte.close();
});

test('FR-40 : reprendre en cours d’année depuis la Balance d’ouverture', async ({ page }) => {
	test.setTimeout(60_000);
	const lien = execFileSync('node', ['build/cli/ape.js', 'lien-initial'], {
		env: envServeur(dossierNeuf, PORT_NEUF),
		encoding: 'utf8'
	}).trim();
	await page.goto(lien);
	await page.getByLabel('Identifiant').fill('alex');
	await page.getByLabel('Nom affiché').fill('Alex Fictif');
	await page.getByLabel('Mot de passe').fill('le cahier passe de main');
	await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await page.waitForURL(/bienvenue|\/$/);
	await page.goto(`${ORIGINE_NEUVE}/bienvenue`);

	await page.getByLabel('Nom de l’APE').fill('APE des Tilleuls');
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByText('au 1er septembre 2026')).toBeVisible();
	await page.locator('#solde-0').fill('1000');
	await page.getByRole('button', { name: 'Continuer' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Natures et Actions');
	await page.getByRole('button', { name: 'Continuer' }).click();

	// Les sommes de 2025-2026 encore dues.
	await page.getByLabel('Tiers').fill('Sam Fictif');
	await page.getByLabel('Motif').fill('Avance de la kermesse 2026');
	await page.getByLabel('Reste dû').fill('42,50');
	await page.getByRole('button', { name: 'Ajouter cette somme' }).click();
	await expect(page.getByRole('list', { name: 'Sommes reprises' })).toContainText('Sam Fictif');
	await page.getByRole('button', { name: 'Terminer' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre cahier est prêt.');

	// Plusieurs fichiers depuis l'ouverture, qui se chevauchent : le contrôle marche dès le premier.
	await page.goto(`${ORIGINE_NEUVE}/pointage`);
	const l = (n: number): LigneOfx => ({
		date: `202609${String(n).padStart(2, '0')}`,
		montant: `-${n}.00`,
		id: `R${n}`,
		libelle: `CB FICTIVE ${n}`
	});
	await deposer(page, fichier([l(1), l(2)], { montant: '997.00', date: '20260902' }, 'a.ofx'));
	await expect(page.getByText('2 lignes lues, 2 nouvelles, 0 déjà connue.')).toBeVisible();
	await expect(barre(page)).toContainText('997,00');
	await expect(barre(page).getByRole('button', { name: /Écart de 3,00/ })).toBeVisible();
	await deposer(page, fichier([l(2), l(3)], { montant: '994.00', date: '20260903' }, 'b.ofx'));
	await expect(page.locator('[data-ligne]')).toHaveCount(3);
	await expect(barre(page).getByRole('button', { name: /Écart de 6,00/ })).toBeVisible();

	await page.goto(`${ORIGINE_NEUVE}/creances-dettes`);
	await expect(page.getByRole('main')).toContainText('Sam Fictif');
	await expect(page.getByRole('main')).toContainText('42,50');
});

/** Tous les écrans du jalon 1, tels qu'ils se présentent avec des données. */
const ecrans = (j: JeuCharge): [string, string][] => [
	['Tableau de contrôle', '/'],
	['Opérations', '/operations'],
	['Panneau Opération', '/operations?op=1'],
	['Nouvelle Opération', '/operations?op=nouvelle'],
	['Pointage', `/pointage/${j.banque}`],
	['Créances et Dettes', '/creances-dettes'],
	['Pièces manquantes', '/pieces'],
	['Toutes les Pièces', '/pieces/toutes'],
	['Photo', '/pieces/photo'],
	['Actions', '/actions'],
	['Une Action', `/actions/${j.kermesse}`],
	['Compte de résultat', '/etats'],
	['État de trésorerie', '/etats/tresorerie'],
	['Document d’AG', '/etats/document-ag'],
	['Clôture', `/reglages/exercices/${j.exercice.courant}/cloture`],
	['Réglages', '/reglages'],
	['Comptes', '/reglages/comptes'],
	['Natures', '/reglages/natures'],
	['Actions, réglages', '/reglages/actions'],
	['Groupes', '/reglages/groupes'],
	['Accès', '/reglages/acces'],
	['Exercices', '/reglages/exercices'],
	['Sauvegardes', '/reglages/sauvegardes'],
	['Restauration', '/reglages/sauvegardes/restauration'],
	['À propos', '/reglages/a-propos'],
	['Journal', '/journal'],
	['Aide', '/aide'],
	['Préférences', '/preferences'],
	['Plus', '/plus']
];

const NOMBRE_ECRANS = 29;

test.describe('axe à 320 px', () => {
	test.use({ viewport: { width: 320, height: 640 } });

	for (const theme of ['light', 'dark'] as const) {
		for (let i = 0; i < NOMBRE_ECRANS; i++) {
			test(`écran ${i + 1}, thème ${theme}`, async ({ page }) => {
				await page.emulateMedia({ colorScheme: theme });
				await connecter(page, COMPTES_FICTIFS.tresorier);
				const [nom, url] = ecrans(jeu)[i] as [string, string];
				await page.goto(url);
				await page.waitForLoadState('networkidle');
				await axeSansViolation(page);
				expect(await sansDefilementHorizontal(page), nom).toBe(true);
			});
		}
	}

	test('Connexion, sans session', async ({ page }) => {
		await page.goto('/connexion');
		await axeSansViolation(page);
		expect(await sansDefilementHorizontal(page)).toBe(true);
	});

	test('la liste couvre tous les écrans', () => {
		expect(ecrans(jeu)).toHaveLength(NOMBRE_ECRANS);
	});
});
