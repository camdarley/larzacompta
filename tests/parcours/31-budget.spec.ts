/**
 * Epic 10 : préparer le Budget, le comparer au réalisé, comparer les Exercices.
 * Avec `CAPTURES=<dossier>`, chaque écran laisse ses captures clair et sombre, à regarder à l'œil.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Download, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import {
	JETON_LECTEUR,
	JETON_TRESORIER,
	preparerInstanceEtats,
	type JeuEtats
} from './aides-etats.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4192;
const ORIGINE = `http://localhost:${PORT}`;
const captures = process.env.CAPTURES;
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial', timeout: captures ? 180_000 : 30_000 });

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuEtats;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-budget-'));
	jeu = preparerInstanceEtats(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

test.beforeEach(async ({ context }) => {
	await context.addCookies([{ name: 'ape_session', value: JETON_TRESORIER, url: ORIGINE }]);
});

const FORMATS = [
	{ nom: 'ordinateur', largeur: 1280, hauteur: 800 },
	{ nom: 'telephone', largeur: 390, hauteur: 780 }
];
const THEMES = [
	['clair', 'light'],
	['sombre', 'dark']
] as const;

async function capturer(page: Page, nom: string, chemin: string) {
	if (!captures || !filtre.test(nom)) return;
	mkdirSync(captures, { recursive: true });
	for (const f of FORMATS) {
		for (const [theme, colorScheme] of THEMES) {
			await page.emulateMedia({ colorScheme });
			await page.setViewportSize({ width: f.largeur, height: f.hauteur });
			await page.goto(chemin, { waitUntil: 'networkidle' });
			await page.screenshot({
				path: join(captures, `${nom}-${f.nom}-${theme}.png`),
				fullPage: true
			});
		}
	}
	await page.emulateMedia({ colorScheme: 'light' });
	await page.setViewportSize({ width: 1280, height: 720 });
}

async function ecranAccessible(page: Page, chemin: string) {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(chemin, { waitUntil: 'networkidle' });
	await axeSansViolation(page);
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto(chemin, { waitUntil: 'networkidle' });
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
	await page.setViewportSize({ width: 1280, height: 720 });
}

function lire<T>(requete: string, ...params: unknown[]): T[] {
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const lignes = b.prepare(requete).all(...params) as T[];
	b.close();
	return lignes;
}

const lignesBudget = () =>
	lire<{ montant_centimes: number }>('SELECT montant_centimes FROM budget_ligne ORDER BY id');
const journalBudget = () =>
	lire<{ n: number }>(
		`SELECT count(*) n FROM journal_modification WHERE evenement LIKE 'budget%'`
	)[0]?.n;

const prevu = (page: Page, nature: string, action: string, sens = 'dépense') =>
	page.getByRole('textbox', { name: `Prévu, ${nature}, ${sens}, ${action}` });

async function texteDe(chemin: string) {
	const doc = await getDocument({ data: new Uint8Array(readFileSync(chemin)) }).promise;
	const page = await doc.getPage(1);
	const contenu = await page.getTextContent();
	const vue = page.getViewport({ scale: 1 });
	return {
		texte: contenu.items.map((i) => ('str' in i ? i.str : '')).join(' '),
		paysage: vue.width > vue.height
	};
}

async function telecharger(page: Page, format: RegExp): Promise<Download> {
	const attente = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Exporter' }).click();
	await page.getByRole('link', { name: format }).click();
	return attente;
}

test('l’état vide propose de repartir du réalisé ou de zéro', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Budget' }).first().click();
	await expect(page).toHaveURL(/\/budget$/);
	await expect(
		page.getByRole('heading', { name: `Pas encore de Budget pour ${jeu.courant}` })
	).toBeVisible();
	await expect(page.getByText('Repartez du réalisé de l’an dernier, puis ajustez.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Repartir du réalisé' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Partir de zéro' })).toBeVisible();
	await capturer(page, 'budget-vide', '/budget');
	await ecranAccessible(page, '/budget');

	// Un Exercice sans précédent tenu n'a que « Partir de zéro ».
	await page.goto(`/budget?exercice=${jeu.ecoule}`);
	await expect(page.getByRole('button', { name: 'Repartir du réalisé' })).toHaveCount(0);
	await expect(page.getByText('Aucun réalisé à reprendre : partez de zéro.')).toBeVisible();

	// Sur téléphone, cet écran se consulte.
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/budget');
	await expect(page.getByText('Cet écran se travaille sur ordinateur.').last()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Repartir du réalisé' })).toBeHidden();
});

test('partir de zéro donne chaque Action, et une prévision s’y ajoute', async ({ page }) => {
	await page.goto('/budget');
	await page.getByRole('link', { name: 'Partir de zéro' }).click();
	await expect(page).toHaveURL(/partir=zero/);
	const grille = page.getByRole('treegrid', { name: 'Budget' });
	await expect(grille.getByRole('row', { name: /^Kermesse/ })).toBeVisible();
	await expect(grille.getByRole('row', { name: /^Sans Action/ })).toBeVisible();

	await page
		.getByRole('combobox', { name: 'Ajouter une prévision à Agrumes' })
		.selectOption({ label: 'Buvette, recette' });
	const champ = prevu(page, 'Buvette', 'Agrumes', 'recette');
	await expect(champ).toBeFocused();
	await champ.fill('150');
	await champ.blur();
	await expect(page.getByRole('status').filter({ hasText: 'Enregistré.' })).toBeVisible();
	expect(lignesBudget()).toEqual([{ montant_centimes: 150_00 }]);
	expect(journalBudget()).toBe(0);

	// Vider le champ retire la prévision : l'Exercice retrouve son état vide.
	await champ.fill('');
	await champ.blur();
	await expect.poll(lignesBudget).toEqual([]);
	await page.goto('/budget');
	await expect(page.getByRole('button', { name: 'Repartir du réalisé' })).toBeVisible();
});

test('repartir du réalisé remplit le Prévu, et Entrée descend', async ({ page }) => {
	await page.goto('/budget');
	await page.getByRole('button', { name: 'Repartir du réalisé' }).click();
	await expect(page.getByText(/prévisions? reprises? de/)).toBeVisible();
	await expect(page).toHaveURL(/ouvert=tout/);

	const sortie = prevu(page, 'Transport', 'Sortie mer');
	await expect(sortie).toHaveValue('450,00');
	expect(lignesBudget().map((l) => l.montant_centimes)).toEqual(
		expect.arrayContaining([450_00, 1_200_00])
	);

	// Un seul geste au clavier : la saisie descend de champ en champ et s'enregistre.
	await sortie.fill('360');
	await sortie.press('Enter');
	const suivant = page.locator('input[name^="prevu-"]:focus');
	await expect(suivant).toHaveCount(1);
	await expect(suivant).not.toHaveAttribute('name', (await sortie.getAttribute('name')) as string);
	await expect.poll(() => lignesBudget().map((l) => l.montant_centimes)).toContain(360_00);
	expect(journalBudget()).toBe(0);

	// L'écart suit sans recharger : 600 € réalisés, 360 € prévus.
	const rangee = page.locator('tr', { has: sortie });
	await expect(rangee).toContainText('+ 240,00 €');
	await expect(rangee).toContainText('+ 67 %');
	await expect(rangee).toContainText('À regarder');
	await expect(page.getByRole('row', { name: /^Sortie mer/ })).toContainText('À regarder');

	await capturer(page, 'budget', '/budget?ouvert=tout');
	await capturer(page, 'budget-replie', '/budget');
	await ecranAccessible(page, '/budget?ouvert=tout');
});

test('une recette au-dessus du prévu ne porte pas de pastille, un montant faux reste à l’écran', async ({
	page
}) => {
	await page.goto('/budget?ouvert=tout', { waitUntil: 'networkidle' });
	const buvette = page.getByRole('row', { name: /^Buvette/ }).first();
	await expect(buvette).not.toContainText('À regarder');

	const champ = prevu(page, 'Transport', 'Sortie mer');
	await champ.fill('12,345');
	await champ.blur();
	await expect(page.getByText('Ce montant n’est pas lisible.', { exact: false })).toBeVisible();
	await expect.poll(() => lignesBudget().map((l) => l.montant_centimes)).toContain(360_00);
	await page.goto('/budget?ouvert=tout', { waitUntil: 'networkidle' });
	await expect(prevu(page, 'Transport', 'Sortie mer')).toHaveValue('360,00');
});

test('le tableau se parcourt au clavier, et l’état déplié vit dans l’URL', async ({ page }) => {
	await page.goto('/budget', { waitUntil: 'networkidle' });
	const premiere = page.locator('tbody tr[data-cle]').first();
	await premiere.focus();
	await page.keyboard.press('ArrowRight');
	await expect(page).toHaveURL(/ouvert=a\d+/);
	await expect(page.locator('tbody tr[aria-level="2"]').first()).toBeVisible();
	await page.keyboard.press('ArrowLeft');
	await expect(page).not.toHaveURL(/ouvert=/);
});

test('un réseau coupé garde le montant, et Réessayer l’enregistre', async ({ page }) => {
	await page.goto('/budget?ouvert=tout', { waitUntil: 'networkidle' });
	await page.route('**/api/budget', (r) => r.abort());
	const champ = prevu(page, 'Transport', 'Sortie mer');
	await champ.fill('375');
	await champ.blur();
	await expect(page.getByRole('alert').first()).toBeVisible();
	await expect(champ).toHaveValue('375,00');
	await page.unroute('**/api/budget');
	await page.getByRole('button', { name: 'Réessayer' }).click();
	await expect.poll(() => lignesBudget().map((l) => l.montant_centimes)).toContain(375_00);
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('le téléphone consulte, sans champ', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/budget?ouvert=tout', { waitUntil: 'networkidle' });
	await expect(page.getByText('Cet écran se travaille sur ordinateur.').first()).toBeVisible();
	await expect(page.locator('input[name^="prevu-"]').first()).toBeHidden();
	await expect(page.getByRole('combobox', { name: /Ajouter une prévision/ })).toHaveCount(0);
	await expect(page.getByRole('row', { name: /^Transport/ }).first()).toBeVisible();
});

test('le Budget s’exporte en PDF, avec ses chiffres', async ({ page }) => {
	await page.goto('/budget');
	const d = await telecharger(page, /^PDF/);
	expect(d.suggestedFilename()).toBe(`budget-${jeu.courant}.pdf`);
	const { texte } = await texteDe((await d.path()) as string);
	expect(texte).toContain('Budget');
	expect(texte).toContain('Sortie mer');
	expect(texte).toContain('Différence');
});

test('la page d’Action montre son Budget, sauf à la lecture', async ({ page, context }) => {
	const [sortieMer] = lire<{ id: number }>(`SELECT id FROM action WHERE libelle = 'Sortie mer'`);
	const adresse = `/actions/${sortieMer?.id}`;
	await page.goto(adresse);
	const section = page.getByRole('region', { name: 'Budget' });
	await expect(section.getByText('Transport')).toBeVisible();
	await expect(section.getByText('Réalisé').first()).toBeVisible();
	await capturer(page, 'budget-action', adresse);
	await ecranAccessible(page, adresse);

	await context.clearCookies();
	await context.addCookies([{ name: 'ape_session', value: JETON_LECTEUR, url: ORIGINE }]);
	await page.goto(adresse);
	await expect(page.getByRole('heading', { name: 'Sortie mer' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Budget' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Budget' })).toHaveCount(0);
	const refus = await page.goto('/budget');
	expect(refus?.status()).toBe(403);
	const exportBudget = await page.request.get('/etats/export?etat=budget&format=pdf');
	expect(exportBudget.status()).toBe(403);
	const ecriture = await page.request.post('/api/budget', { data: {} });
	expect(ecriture.status()).toBe(403);
});

test('« Comparer à » ajoute une colonne, vit dans l’URL et passe aux exports', async ({ page }) => {
	await page.goto('/etats');
	await expect(page.getByRole('columnheader', { name: jeu.ecoule })).toHaveCount(0);
	await page.getByRole('button', { name: 'Comparer à' }).click();
	await page.getByRole('link', { name: jeu.ecoule }).click();
	await expect(page).toHaveURL(new RegExp(`comparer=${jeu.ecoule}`));
	await expect(page.getByRole('columnheader', { name: jeu.ecoule })).toBeVisible();

	// Rechargée, l'adresse rouvre la même comparaison.
	await page.reload();
	await expect(page.getByRole('columnheader', { name: jeu.ecoule })).toBeVisible();

	const evenements = page.getByRole('row', { name: /^Évènements/ }).first();
	await expect(evenements).toContainText('− 450,00 €');
	await evenements.click();
	const sortie = page.getByRole('row', { name: /^Sortie mer/ });
	await expect(sortie.getByRole('gridcell').nth(4)).toContainText('− 450,00 €');
	const kermesse = page.getByRole('row', { name: /^Kermesse/ });
	await expect(kermesse.getByRole('gridcell').nth(4)).toBeEmpty();

	const url = page.url().replace(ORIGINE, '');
	await capturer(page, 'comparer', url);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(url, { waitUntil: 'networkidle' });
	await axeSansViolation(page);

	const d = await telecharger(page, /^PDF/);
	expect(d.suggestedFilename()).toBe(`compte-de-resultat-${jeu.courant}-comparaison.pdf`);
	const pdf = await texteDe((await d.path()) as string);
	expect(pdf.paysage).toBe(true);
	expect(pdf.texte).toContain(jeu.ecoule);
	const x = await telecharger(page, /^XLSX/);
	expect(x.suggestedFilename()).toBe(`compte-de-resultat-${jeu.courant}-comparaison.xlsx`);
});

test('sur téléphone, les colonnes de comparaison sont masquées', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto(`/etats?comparer=${jeu.ecoule}`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('button', { name: /Comparer à/ })).toBeHidden();
	await expect(page.getByText(jeu.ecoule, { exact: true }).first()).toBeHidden();
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
});

test('un Exercice clôturé garde son Budget, en lecture, et se compare figé', async ({ page }) => {
	const [ecoule] = lire<{ id: number }>('SELECT id FROM exercice WHERE libelle = ?', jeu.ecoule);
	const [nature] = lire<{ id: number }>(`SELECT id FROM nature WHERE libelle = 'Transport'`);
	const [action] = lire<{ id: number }>(`SELECT id FROM action WHERE libelle = 'Sortie mer'`);
	const reponse = await page.request.post('/api/budget', {
		headers: { origin: ORIGINE },
		data: {
			exerciceId: ecoule?.id,
			actionId: action?.id,
			natureId: nature?.id,
			sens: 'depense',
			montant: 500_00
		}
	});
	expect(reponse.status(), await reponse.text()).toBe(200);

	const base = ouvrirBase(join(dossier, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(dossier, 'fichiers')) });
	const tresorier = app.socle.depots.acces.lister().find((a) => a.role === 'tresorier')!;
	const ctx = app.ctx({
		id: tresorier.id,
		identifiant: tresorier.identifiant,
		nomAffiche: tresorier.nomAffiche,
		role: tresorier.role,
		preferences: { theme: 'systeme', raccourcis: true }
	});
	const cloture = app.exercices.cloturer(ctx, ecoule?.id as number);
	expect(cloture.ok).toBe(true);
	// Renommée après la clôture : l'Exercice clôturé garde le nom de sa clôture.
	const p = app.socle.depots.parametrage;
	const a = p.actions().find((x) => x.id === action?.id)!;
	p.modifierAction(a.id, { ...a, libelle: 'Traversée' });
	base.close();

	await page.goto(`/budget?exercice=${jeu.ecoule}&ouvert=tout`, { waitUntil: 'networkidle' });
	await expect(page.getByText('Exercice clôturé, lecture seule')).toHaveCount(1);
	await expect(page.locator('input[name^="prevu-"]')).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: /Ajouter une prévision/ })).toHaveCount(0);
	await expect(page.getByRole('row', { name: /^Sortie mer/ })).toBeVisible();
	await capturer(page, 'budget-cloture', `/budget?exercice=${jeu.ecoule}&ouvert=tout`);
	await ecranAccessible(page, `/budget?exercice=${jeu.ecoule}&ouvert=tout`);

	await page.goto(`/etats?comparer=${jeu.ecoule}&ouvert=g1`);
	await expect(page.getByRole('row', { name: /^Traversée/ })).toBeVisible();
	await expect(
		page
			.getByRole('row', { name: /^Traversée/ })
			.getByRole('gridcell')
			.nth(4)
	).toContainText('− 450,00 €');
	await page.goto(`/etats?exercice=${jeu.ecoule}&comparer=${jeu.courant}&ouvert=g1`);
	await expect(page.getByRole('row', { name: /^Sortie mer/ })).toBeVisible();
});
