/**
 * Chèques et SumUp de bout en bout : « Camille dépose les chèques » puis le relevé, au clavier,
 * sur une instance à part. Chaque écran passe axe, à 1280 et à 320 px.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { JETONS, preparerCaisses } from './aides-caisses.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4187;
const ORIGINE = `http://localhost:${PORT}`;
const NBSP = /[\s  ]/;
const euros = (texte: string) =>
	new RegExp(texte.replaceAll(' ', `${NBSP.source}`).replaceAll('+', '\\+'));

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;
let jeu: ReturnType<typeof preparerCaisses>;
let jourOfx: string;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-cheques-'));
	jeu = preparerCaisses(dossier);
	// Les Natures de ce parcours, écrites comme le ferait l'assistant.
	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });
	const depots = app.socle.depots;
	const groupeId = depots.parametrage.groupes()[0]!.id;
	for (const libelle of ['Ventes', 'Frais bancaires']) {
		depots.parametrage.creerNature({ libelle, groupeId, neutre: false, codeSysteme: null });
	}
	depots.parametrage.creerAction({ libelle: 'Agrumes', groupeId, avecCaisse: false });
	depots.parametrage.creerAction({ libelle: 'Loto', groupeId, avecCaisse: false });
	base.close();
	jourOfx = jeu.aujourdhui.replaceAll('-', '');
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function connecte(page: Page, role: keyof typeof JETONS = 'tresorier') {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

/** Avec `CAPTURES=<dossier>` : le geste tel qu'il se voit, dans les deux thèmes. */
async function geste(page: Page, nom: string) {
	const sortie = process.env.CAPTURES;
	if (!sortie) return;
	mkdirSync(sortie, { recursive: true });
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await page.screenshot({ path: join(sortie, `geste-${nom}-${colorScheme}.png`) });
	}
	await page.emulateMedia({ colorScheme: 'light' });
}

async function ecran(page: Page) {
	await axeSansViolation(page);
	expect(await sansDefilementHorizontal(page)).toBe(true);
}

const rafale = (page: Page) => page.getByRole('form', { name: 'Enregistrer un Chèque reçu' });

async function choisir(page: Page, id: string, texte: string) {
	await page.locator(id).fill(texte);
	await page.keyboard.press('Enter');
}

/** Au clavier : émetteur, Tab, banque, Tab, montant, Entrée. La date et l'Action restent. */
async function chequeAuClavier(page: Page, emetteur: string, banque: string, montant: string) {
	await page.keyboard.type(emetteur);
	await page.keyboard.press('Tab');
	await page.keyboard.type(banque);
	await page.keyboard.press('Tab');
	await page.keyboard.type(montant);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('main')).toContainText(`Chèque de ${emetteur} enregistré.`);
	await expect(page.locator('#rafale-emetteur')).toBeFocused();
	await expect(page.locator('#rafale-emetteur')).toHaveValue('');
}

test.describe('Camille dépose les chèques des Agrumes', () => {
	test('aucun chèque : l’état vide prévu, et le Chèque apparaît dans la navigation', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/');
		await page.getByRole('link', { name: 'Chèques', exact: true }).first().click();
		await expect(page).toHaveURL(/\/cheques$/);
		await expect(page.getByRole('heading', { name: 'Aucun chèque à remettre' })).toBeVisible();
		await expect(page.getByText('Les Chèques reçus attendront ici leur Remise.')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Chèques' })).toBeVisible();
		await ecran(page);
	});

	test('une pile en rafale : Entrée enregistre et repart, en gardant date et Action', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await expect(page.locator('#rafale-emetteur')).toBeFocused();
		// L'Action et la Nature d'abord, une seule fois : elles restent pour toute la pile.
		await choisir(page, '#rafale-action', 'Agrumes');
		await choisir(page, '#rafale-nature', 'Ventes');
		await page.locator('#rafale-emetteur').focus();

		await chequeAuClavier(page, 'Famille Abricot', 'Banque des Prés', '30');
		await expect(page.locator('#rafale-action')).toHaveValue('Agrumes');
		await chequeAuClavier(page, 'Famille Bergamote', 'Banque des Prés', '45,50');
		await chequeAuClavier(page, 'Famille Cédrat', 'Crédit du Vallon', '22,50');
		await expect(
			page.getByRole('table', { name: 'Chèques reçus' }).locator('tbody tr')
		).toHaveCount(3);
		await expect(page.getByLabel('Total à remettre')).toContainText(euros('98,00 €'));
		await ecran(page);
	});

	test('sans émetteur ni montant, la rangée dit ce qui manque, sans rien enregistrer', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await expect(page.locator('#rafale-emetteur')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('#rafale-emetteur')).toHaveAttribute('aria-invalid', 'true');
		await expect(
			page.getByRole('table', { name: 'Chèques reçus' }).locator('tbody tr')
		).toHaveCount(3);
	});

	test('une coupure pendant la rafale : la saisie reste, Réessayer enregistre une fois', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await expect(page.locator('#rafale-emetteur')).toBeFocused();
		await choisir(page, '#rafale-action', 'Agrumes');
		await choisir(page, '#rafale-nature', 'Ventes');
		await page.locator('#rafale-emetteur').fill('Famille Datte');
		await page.locator('#rafale-montant').fill('10');
		await page.route('**/api/cheques/recus', (r) => r.abort());
		await page.locator('#rafale-montant').press('Enter');
		await expect(page.getByRole('alert')).toContainText('Pas de réseau pour l’instant');
		await expect(page.locator('#rafale-emetteur')).toHaveValue('Famille Datte');
		await page.unroute('**/api/cheques/recus');
		await page.getByRole('button', { name: 'Réessayer' }).click();
		await expect(page.getByRole('main')).toContainText('Chèque de Famille Datte enregistré.');
		await expect(
			page.getByRole('table', { name: 'Chèques reçus' }).locator('tbody tr')
		).toHaveCount(4);
	});

	test('plusieurs Actions : la ventilation s’ouvre dans le panneau, contrôlée au centime', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await page.locator('#rafale-emetteur').fill('Famille Églantine');
		await page.locator('#rafale-montant').fill('60');
		await page.getByRole('button', { name: 'Plusieurs Actions pour ce chèque' }).click();
		const panneau = page.getByRole('dialog');
		await expect(panneau.getByLabel('Émetteur')).toHaveValue('Famille Églantine');
		await expect(panneau.getByRole('heading', { name: 'Répartir' })).toBeVisible();
		await page.keyboard.press('Control+Enter');
		await expect(
			panneau.getByRole('alert').or(panneau.locator('[aria-invalid="true"]')).first()
		).toBeVisible();

		const ligne = panneau.getByRole('listitem').first();
		await ligne.getByLabel('Montant de la ligne 1').fill('40');
		await ligne.getByLabel('Nature de la ligne 1').fill('Ventes');
		await page.keyboard.press('Enter');
		await ligne.getByLabel('Action de la ligne 1').fill('Agrumes');
		await page.keyboard.press('Enter');
		await expect(panneau.getByTestId('reste')).toContainText(euros('20,00 €'));
		await panneau.getByTestId('reste').getByRole('button').click();
		await panneau.getByLabel('Nature de la ligne 2').fill('Ventes');
		await page.keyboard.press('Enter');
		await panneau.getByLabel('Action de la ligne 2').fill('Loto');
		await page.keyboard.press('Enter');
		await expect(panneau.getByTestId('reste')).toContainText('Tout est réparti');
		await axeSansViolation(page);
		await geste(page, 'ventilation');
		await page.keyboard.press('Control+Enter');
		await expect(panneau).toBeHidden();
		const rangee = page.getByRole('row', { name: /Famille Églantine/ });
		await expect(rangee).toContainText('Agrumes, Loto');
		await expect(page.locator('#rafale-emetteur')).toHaveValue('');
	});

	test('la Remise : tout est coché, le total suit, le dialogue montre les chiffres', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await page.getByRole('link', { name: 'Nouvelle Remise' }).click();
		await expect(page).toHaveURL(/\/cheques\/remises\/nouvelle$/);
		const cases = page.getByRole('checkbox', { name: /Remettre le chèque/ });
		await expect(cases).toHaveCount(5);
		for (const c of await cases.all()) await expect(c).toBeChecked();
		await expect(page.getByTestId('total-remise')).toContainText(euros('168,00 €'));
		await page.getByRole('checkbox', { name: /Famille Datte/ }).uncheck();
		await expect(page.getByTestId('total-remise')).toContainText(euros('158,00 €'));
		await page.getByLabel('Compte de destination').selectOption({ label: 'CCP imaginaire' });
		await ecran(page);

		await page.getByRole('button', { name: 'Créer la Remise' }).click();
		const dialogue = page.getByRole('dialog');
		await expect(dialogue).toContainText('4 chèques');
		await expect(dialogue).toContainText(euros('158,00 €'));
		await expect(dialogue.getByRole('button', { name: 'Revenir' })).toBeFocused();
		await geste(page, 'dialogue-remise');
		await dialogue.getByRole('button', { name: 'Créer la Remise' }).click();
		await expect(page).toHaveURL(/\/cheques\/remises\/\d+$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Remise n° 1');
		await ecran(page);
	});

	test('le bordereau : un PDF A4 téléchargé depuis la Remise', async ({ page }) => {
		await connecte(page);
		await page.goto('/cheques/remises');
		await page.getByRole('link', { name: '4 chèques' }).click();
		const [telechargement] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('link', { name: 'Télécharger le bordereau' }).click()
		]);
		expect(telechargement.suggestedFilename()).toBe('bordereau-remise-1.pdf');
		if (process.env.CAPTURES) {
			await telechargement.saveAs(join(process.env.CAPTURES, 'bordereau.pdf'));
		}
	});

	test('le relevé arrive : la Remise est proposée avec ses chèques, SumUp et un chèque inconnu', async ({
		page
	}) => {
		await connecte(page);
		await page.goto(`/pointage/${jeu.ccp}`);
		const ofx = ofxTexte(
			[
				{ date: jourOfx, montant: '158.00', id: 'Q1', libelle: 'REMISE CHEQUES 0000042' },
				{ date: jourOfx, montant: '95.00', id: 'Q2', libelle: 'VIREMENT SUMUP PAYOUT' },
				{ date: jourOfx, montant: '-35.00', id: 'Q3', libelle: 'CHEQUE N 5000999' }
			],
			{ montant: '1418.00', date: jourOfx }
		);
		await page
			.locator('input[type=file]')
			.first()
			.setInputFiles({
				name: 'releve-fictif.ofx',
				mimeType: 'application/x-ofx',
				buffer: Buffer.from(ofxCp1252(ofx))
			});
		await expect(page.getByText('3 lignes lues, 3 nouvelles')).toBeVisible();

		await expect(page.getByText('Même montant, Remise de 4 chèques')).toBeVisible();
		await expect(page.getByRole('list', { name: 'Chèques de la Remise n° 1' })).toContainText(
			'Famille Abricot'
		);
		await expect(page.getByRole('link', { name: 'Voir le bordereau n° 1' })).toBeVisible();
		await ecran(page);
		await geste(page, 'proposition-remise');
		await page.keyboard.press('Enter');
		await expect(page.getByText('Pointé.', { exact: true })).toBeVisible();

		// SumUp : la ligne suivante. Camille entre les frais, le net se contrôle.
		await page.getByRole('button', { name: 'Répartir brut et frais' }).click();
		const panneau = page.getByRole('dialog');
		await expect(panneau.getByRole('heading', { name: 'Répartir brut et frais' })).toBeVisible();
		await panneau.getByLabel('Nature de la ligne 1').fill('Ventes');
		await page.keyboard.press('Enter');
		await panneau.getByLabel('Montant de la ligne 2').fill('5');
		await expect(panneau.getByLabel('Montant de la ligne 1')).toHaveValue(/100/);
		await expect(panneau.getByTestId('reste')).toContainText('Tout est réparti');
		await axeSansViolation(page);
		await geste(page, 'sumup');
		await page.keyboard.press('Control+Enter');
		await expect(panneau).toBeHidden();
		await expect(page.getByText('Pointé.', { exact: true }).first()).toBeVisible();

		// Le chèque inconnu.
		await expect(page.getByText('Chèque vu en banque, absent du registre')).toBeVisible();
		await geste(page, 'cheque-absent');
	});

	test('Remise et chèques passent à Pointé, sans le dire ailleurs', async ({ page }) => {
		await connecte(page);
		await page.goto('/cheques?etat=pointe');
		await expect(
			page.getByRole('table', { name: 'Chèques reçus' }).locator('tbody tr')
		).toHaveCount(4);
		await page.goto('/cheques/remises');
		await page.getByRole('link', { name: '4 chèques' }).click();
		await expect(page.getByRole('heading', { name: 'Au relevé' })).toBeVisible();
		await expect(page.getByRole('main')).toContainText('REMISE CHEQUES 0000042');
		await expect(page.getByRole('button', { name: 'Annuler la Remise' })).toHaveCount(0);
	});

	test('le chèque absent remonte, puis disparaît une fois inscrit depuis la ligne', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/');
		await expect(page.getByRole('link', { name: /Chèques vus en banque/ })).toBeVisible();
		await page.goto('/cheques/emis');
		await expect(
			page.getByRole('heading', { name: 'Vus en banque, absents du registre' })
		).toBeVisible();
		await page.getByRole('link', { name: 'Voir la ligne' }).click();
		await page.getByRole('button', { name: 'Créer l’Opération' }).click();
		const panneau = page.getByRole('dialog');
		await expect(panneau.getByLabel('N° de chèque')).toHaveValue('5000999');
		await panneau.getByLabel('Bénéficiaire').fill('Salle imaginaire');
		await panneau.getByLabel('Nature de la ligne 1').fill('Ventes');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+Enter');
		await expect(panneau).toBeHidden();
		await page.goto('/cheques/emis');
		await expect(page.getByRole('heading', { name: /Vus en banque/ })).toHaveCount(0);
		await expect(page.getByRole('table', { name: 'Registre des Chèques émis' })).toContainText(
			'5000999'
		);
		await ecran(page);
	});

	test('une Dépense en mode Chèque demande n° et bénéficiaire, et un n° pris est refusé', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques/emis?op=nouvelle&intention=depense&mode=cheque');
		const panneau = page.getByRole('dialog');
		await panneau.getByLabel('Montant', { exact: true }).fill('12');
		await panneau.getByLabel('Libellé').fill('Fournitures imaginaires');
		await panneau.getByLabel('Nature de la ligne 1').fill('Ventes');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+Enter');
		await expect(panneau.getByLabel('N° de chèque')).toHaveAttribute('aria-invalid', 'true');
		await panneau.getByLabel('N° de chèque').fill('05000999');
		await panneau.getByLabel('Bénéficiaire').fill('Papeterie imaginaire');
		await page.keyboard.press('Control+Enter');
		await expect(panneau.getByText('Ce n° de chèque est déjà au registre')).toBeVisible();
	});

	test('rejeté : le dialogue prévient, la recette s’annule, le chèque reste au registre', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/cheques');
		await page.getByRole('button', { name: 'Gestes sur le chèque de Famille Datte' }).click();
		await page.getByRole('button', { name: 'Marquer comme rejeté' }).click();
		const dialogue = page.getByRole('dialog');
		await expect(dialogue).toContainText('sera annulée par une nouvelle Opération');
		await geste(page, 'dialogue-rejet');
		await axeSansViolation(page);
		await dialogue.getByRole('button', { name: 'Marquer comme rejeté' }).click();
		await expect(dialogue).toBeHidden();
		await page.goto('/cheques?etat=rejete');
		await expect(page.getByRole('row', { name: /Famille Datte/ })).toContainText('Rejeté');
	});

	test('une formule annulée reste au registre', async ({ page }) => {
		await connecte(page);
		await page.goto('/cheques/emis');
		await page.getByRole('button', { name: 'Annuler une formule' }).click();
		await page.getByLabel('N° du chèque').fill('5000200');
		await page.getByRole('dialog').getByRole('button', { name: 'Annuler la formule' }).click();
		await expect(page.getByRole('row', { name: /5000200/ })).toContainText('Annulé');
	});
});

test.describe('lecture et téléphone', () => {
	test('un·e lecteur·rice consulte Chèques sans rien pouvoir changer', async ({ page }) => {
		await connecte(page, 'lecteur');
		await page.goto('/cheques?etat=tous');
		await expect(page.getByRole('table', { name: 'Chèques reçus' })).toBeVisible();
		await expect(rafale(page)).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Gestes sur/ })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Nouvelle Remise' })).toHaveCount(0);
		await ecran(page);
		for (const chemin of ['/cheques/remises', '/cheques/emis']) {
			await page.goto(chemin);
			await ecran(page);
		}
		await page.getByRole('link', { name: 'Remises' }).click();
		await page.getByRole('link', { name: '4 chèques' }).click();
		await expect(page.getByRole('button', { name: 'Annuler la Remise' })).toHaveCount(0);
		const r = await page.request.post(`${ORIGINE}/api/cheques/formules`, {
			headers: { origin: ORIGINE },
			data: { numero: '1' }
		});
		expect(r.status()).toBe(403);
		const refus = await page.goto('/cheques/remises/nouvelle');
		expect(refus?.status()).toBe(403);
	});

	test('un·e compteur·se n’y a pas accès', async ({ page }) => {
		await connecte(page, 'compteur');
		const r = await page.goto('/cheques');
		expect(r?.status()).toBe(403);
	});

	for (const largeur of [390, 320]) {
		test(`à ${largeur} px, les listes se consultent, sans rangée de saisie`, async ({ page }) => {
			await page.setViewportSize({ width: largeur, height: 780 });
			await connecte(page);
			await page.goto('/cheques?etat=tous');
			await expect(rafale(page)).toBeHidden();
			await ecran(page);
			await page.goto('/cheques/remises');
			await ecran(page);
			await page.goto('/cheques/emis');
			await ecran(page);
			await page.goto('/cheques/remises/1');
			await ecran(page);
		});
	}

	test('Nouvelle Remise se réserve à l’ordinateur', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 780 });
		await connecte(page);
		// Un chèque en attente : l'écran existe.
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/cheques');
		await expect(page.locator('#rafale-emetteur')).toBeFocused();
		await choisir(page, '#rafale-action', 'Agrumes');
		await choisir(page, '#rafale-nature', 'Ventes');
		await page.locator('#rafale-emetteur').fill('Famille Figue');
		await page.locator('#rafale-montant').fill('15');
		await page.locator('#rafale-montant').press('Enter');
		await expect(page.getByRole('main')).toContainText('Chèque de Famille Figue enregistré.');
		await page.setViewportSize({ width: 390, height: 780 });
		await page.goto('/cheques/remises/nouvelle');
		await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Créer la Remise' })).toBeHidden();
		await ecran(page);
	});
});
