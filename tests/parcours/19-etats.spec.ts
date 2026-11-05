/**
 * Contrôle, états, exports, clôture : stories 5.2 à 5.9, sur une instance à part.
 * Son jeu est écrit par les vrais cas d'usage : chaque chiffre attendu se relit dans `aides-etats.ts`.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Download, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { unzipSync, strFromU8 } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import {
	JETON_LECTEUR,
	JETON_TRESORIER,
	preparerInstanceEtats,
	type JeuEtats
} from './aides-etats.ts';

const PORT = 4175;
const ORIGINE = `http://localhost:${PORT}`;
const INTERDITS = /d[ée]bits?|cr[ée]dits?|[ée]critures?|contreparties?/i;
const captures = process.env.CAPTURES;
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial', timeout: captures ? 180_000 : 30_000 });

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuEtats;

async function attendreSante() {
	for (let i = 0; i < 100; i++) {
		const reponse = await fetch(`${ORIGINE}/sante`).catch(() => null);
		if (reponse?.ok) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('L’instance des états ne répond pas.');
}

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-etats-'));
	jeu = preparerInstanceEtats(dossier);
	serveur = spawn('node', ['build/index.js'], {
		stdio: 'ignore',
		env: {
			...process.env,
			APE_DONNEES: dossier,
			ORIGIN: ORIGINE,
			PROTOCOL_HEADER: 'x-forwarded-proto',
			BODY_SIZE_LIMIT: '25M',
			PORT: String(PORT),
			HOST: '127.0.0.1',
			TZ: 'Europe/Paris'
		}
	});
	await attendreSante();
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

/** Relecture à l'œil : ordinateur et téléphone, clair et sombre. Un geste à rejouer : sur ordinateur. */
async function capturer(page: Page, nom: string, chemin: string, avant?: () => Promise<void>) {
	if (!captures || !filtre.test(nom)) return;
	mkdirSync(captures, { recursive: true });
	for (const f of FORMATS.filter((x) => avant === undefined || x.nom === 'ordinateur')) {
		for (const [theme, colorScheme] of THEMES) {
			await page.emulateMedia({ colorScheme });
			await page.setViewportSize({ width: f.largeur, height: f.hauteur });
			await page.goto(chemin, { waitUntil: 'networkidle' });
			await avant?.();
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

function sql(requete: string) {
	const b = new Database(join(dossier, 'base.sqlite'));
	b.exec(requete);
	b.close();
}

function ape(...args: string[]) {
	return execFileSync('node', ['build/cli/ape.js', ...args], {
		env: {
			...process.env,
			APE_DONNEES: dossier,
			ORIGIN: ORIGINE,
			TZ: 'Europe/Paris'
		},
		encoding: 'utf8'
	});
}

async function telecharger(page: Page, declencher: () => Promise<unknown>): Promise<Download> {
	const attente = page.waitForEvent('download');
	await declencher();
	return attente;
}

async function octets(d: Download) {
	return new Uint8Array(readFileSync(await d.path()));
}

/** Texte de toutes les pages, tel qu'un lecteur d'écran ou une recherche le retrouve. */
async function textePdf(donnees: Uint8Array) {
	const doc = await getDocument({ data: donnees.slice(), useSystemFonts: false }).promise;
	const pages: string[] = [];
	for (let i = 1; i <= doc.numPages; i += 1) {
		const contenu = await (await doc.getPage(i)).getTextContent();
		pages.push(contenu.items.map((t) => ('str' in t ? t.str : '')).join(' '));
	}
	return pages.join('\n');
}

test('5.2 : la phrase, les soldes, les tuiles', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const principal = page.getByRole('main');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		/\d+ petites? choses? à regarder\./
	);

	const ccp = principal.getByRole('article').filter({ hasText: 'CCP imaginaire' });
	await expect(ccp).toContainText('Solde de départ');
	await expect(ccp).toContainText('Solde constaté');
	await expect(ccp).toContainText(/Écart de 95,00.€\. 2 lignes non pointées l’expliquent\./);
	await expect(ccp.getByRole('link', { name: 'CCP imaginaire' })).toHaveAttribute(
		'href',
		`/pointage/${jeu.ccp}`
	);

	const livret = principal.getByRole('article').filter({ hasText: 'Livret imaginaire' });
	await expect(livret).toContainText('Égal au relevé');

	await expect(principal.getByRole('link', { name: /Lignes de relevé à pointer/ })).toHaveAttribute(
		'href',
		'/pointage'
	);
	await expect(principal.getByRole('link', { name: /Pièces manquantes/ })).toHaveAttribute(
		'href',
		'/pieces'
	);
	await expect(principal.getByRole('link', { name: /Opérations anciennes/ })).toContainText(
		'Rien à faire'
	);
	await capturer(page, 'tableau', '/');
	await capturer(page, 'tableau-exercice-ecoule', `/?exercice=${jeu.ecoule}`);
	await ecranAccessible(page, '/');
});

test('5.2 : le solde d’une caisse se saisit sur sa carte, sans lien vers le Pointage', async ({
	page
}) => {
	await page.goto('/', { waitUntil: 'networkidle' });
	const caisse = page.getByRole('article').filter({ hasText: 'Caisse de la fête' });
	await expect(caisse.getByRole('link')).toHaveCount(0);
	await expect(caisse).toContainText('Pas encore comptée');
	await caisse.getByLabel(/^Compté le/).fill('80');
	await caisse.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(caisse).toContainText('Égal au comptage');

	await caisse.getByLabel(/^Compté le/).fill('78,50');
	await caisse.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(caisse).toContainText(/Écart de 1,50.€/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 Compte ne tombe pas juste.');
	await caisse.getByLabel(/^Compté le/).fill('80');
	await caisse.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/à regarder\.$/);
});

test('5.2 : sur téléphone, phrase, soldes empilés, puis À faire', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/', { waitUntil: 'networkidle' });
	const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
	const carte = await page.getByRole('article').first().boundingBox();
	const faire = await page.getByRole('heading', { name: 'À faire' }).boundingBox();
	expect(h1!.y).toBeLessThan(carte!.y);
	expect(carte!.y).toBeLessThan(faire!.y);
});

test('5.3 : déplier au clavier, l’état vit dans l’URL', async ({ page }) => {
	await page.goto('/actions', { waitUntil: 'networkidle' });
	const grille = page.getByRole('treegrid').first();
	const groupe = grille.getByRole('row', { name: /Évènements/ });
	await groupe.focus();
	await page.keyboard.press('ArrowRight');
	await expect(page).toHaveURL(/ouvert=g\d+/);
	await expect(groupe).toHaveAttribute('aria-expanded', 'true');
	await expect(groupe).toBeFocused();

	const kermesse = grille.getByRole('row', { name: /Kermesse/ });
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(grille.getByRole('row').filter({ hasText: 'Kermesse' })).toBeVisible();
	await kermesse.focus();
	await page.keyboard.press('ArrowRight');
	await expect(kermesse).toHaveAttribute('aria-expanded', 'true');
	await expect(kermesse).toHaveAttribute('aria-level', '2');
	await page.keyboard.press('ArrowLeft');
	await expect(kermesse).toHaveAttribute('aria-expanded', 'false');
	await page.keyboard.press('ArrowLeft');
	await expect(groupe).toBeFocused();

	await kermesse.focus();
	await page.keyboard.press('ArrowRight');
	await expect(kermesse).toHaveAttribute('aria-expanded', 'true');
	await page.reload({ waitUntil: 'networkidle' });
	await expect(grille.getByRole('row', { name: /Kermesse/ })).toHaveAttribute(
		'aria-expanded',
		'true'
	);
});

test('un mot du glossaire touche sa ponctuation', async ({ page }) => {
	await page.goto('/etats', { waitUntil: 'networkidle' });
	await expect(page.getByRole('main')).toContainText('Mouvements internes, ni les');
});

test('5.3 : une rangée se lit une fois, montants en toutes lettres', async ({ page }) => {
	await page.goto('/actions', { waitUntil: 'networkidle' });
	const groupe = page
		.getByRole('treegrid')
		.first()
		.getByRole('row', { name: /Évènements/ });
	const nom = await groupe.evaluate(
		(e) => e.querySelector('.resultat .visuellement-cache')?.textContent ?? ''
	);
	expect(nom).toMatch(/^(moins )?[\d\s]+ euros?/);
	await expect(groupe).not.toHaveAccessibleName(/Déplier|Replier/);
	await expect(groupe).not.toHaveAccessibleName(/Évènements.*Évènements/);
	await expect(groupe).toHaveAccessibleName(new RegExp(nom.replaceAll(/\s/g, '\\s')));
});

test('5.3 : une Ligne ouvre l’Opération, l’icône Pièce ouvre la visionneuse', async ({ page }) => {
	await page.goto('/actions', { waitUntil: 'networkidle' });
	const grille = page.getByRole('treegrid').first();
	for (const nom of [/Évènements/, /Kermesse/, /Transport/]) {
		await grille.getByRole('row', { name: nom }).first().click();
		await expect(grille.getByRole('row', { name: nom }).first()).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	}
	const url = page.url();
	await capturer(page, 'actions-deplie', url.replace(ORIGINE, ''));

	const ligne = grille.getByRole('row', { name: /Autocars du Vallon/ });
	await ligne.getByRole('link', { name: /Ouvrir la Pièce/ }).click();
	await expect(page).toHaveURL(/visionneuse=/);
	await expect(page.getByRole('dialog')).toContainText('facture-autocars-fictive.pdf');
	await capturer(page, 'actions-visionneuse', page.url().replace(ORIGINE, ''));
	await page.keyboard.press('Escape');
	await expect(page).not.toHaveURL(/visionneuse=/);

	await grille.getByRole('row', { name: /Autocars du Vallon/ }).click();
	await expect(page).toHaveURL(/op=\d+/);
	const panneau = page.getByRole('dialog');
	// Pièce et Mouvement bancaire : ce qu'un·e vérificateur·rice vient chercher.
	await expect(
		panneau.getByRole('button', { name: /Ouvrir facture-autocars/ }).first()
	).toBeAttached();
	await expect(panneau).toContainText('AUTOCARS DU VALLON');
	await page.keyboard.press('Escape');
});

test('5.3 : le pied égale le résultat, les Lignes antérieures forment un bloc', async ({
	page
}) => {
	await page.goto('/actions', { waitUntil: 'networkidle' });
	const principal = page.getByRole('main');
	await expect(principal.getByText('Résultat de l’Exercice')).toBeVisible();
	await expect(principal.getByRole('link', { name: 'Voir le Compte de résultat' })).toBeVisible();
	await expect(principal.getByRole('heading', { name: 'Sur Exercices antérieurs' })).toBeVisible();
	await expect(
		page
			.getByRole('treegrid')
			.first()
			.getByRole('row', { name: /Somme à rendre/ })
	).toHaveCount(0);
	await capturer(page, 'actions', '/actions');
	await ecranAccessible(page, '/actions');
	await ecranAccessible(page, `/actions/${jeu.kermesse}`);
	await capturer(page, 'action-page', `/actions/${jeu.kermesse}`);
});

test('5.3 : sur téléphone, le dépliage reste complet jusqu’à la Pièce', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/actions', { waitUntil: 'networkidle' });
	const grille = page.getByRole('treegrid').first();
	for (const nom of [/Évènements/, /Kermesse/, /Transport/]) {
		await grille.getByRole('row', { name: nom }).first().click();
	}
	await expect(grille.getByRole('link', { name: /Ouvrir la Pièce/ })).toBeVisible();
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await expect(grille.getByText(/^Recettes /).first()).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 720 });
});

test('5.4 : Compte de résultat, État de trésorerie, explication', async ({ page }) => {
	await page.goto('/etats', { waitUntil: 'networkidle' });
	const onglets = page.getByRole('navigation', { name: 'États' });
	await expect(onglets.getByRole('link')).toHaveText([
		'Compte de résultat',
		'État de trésorerie',
		'Document d’AG'
	]);
	const lignes = page.getByRole('treegrid').first().getByRole('row');
	await expect(lignes.nth(1)).toContainText('Évènements');
	await expect(page.getByRole('heading', { name: 'Sur Exercices antérieurs' })).toBeVisible();
	await capturer(page, 'etats-resultat', '/etats');
	await ecranAccessible(page, '/etats');

	await onglets.getByRole('link', { name: 'État de trésorerie' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('État de trésorerie');
	const principal = page.getByRole('main');
	await expect(principal.getByRole('table')).toContainText('CCP imaginaire');
	await expect(principal).toContainText('Ce que l’APE attend');
	await expect(principal).toContainText(/500,00/);
	await expect(principal).toContainText(/75,00/);
	for (const terme of [
		'Résultat de l’Exercice',
		'Lignes sur Exercices antérieurs',
		'Natures neutres',
		'Mouvements internes en transit'
	]) {
		await expect(principal.getByRole('link', { name: terme })).toBeVisible();
	}
	await capturer(page, 'etats-tresorerie', '/etats/tresorerie');
	await ecranAccessible(page, '/etats/tresorerie');
});

test('5.4 : une anomalie s’affiche, aucun total n’est masqué', async ({ page }) => {
	sql(`UPDATE ligne SET montant_centimes = montant_centimes - 100
		WHERE operation_id = (SELECT id FROM operation WHERE libelle = 'Frais de tenue de compte')`);
	await page.goto('/etats/tresorerie', { waitUntil: 'networkidle' });
	await expect(page.getByRole('alert')).toContainText(/diffèrent de 1,00/);
	await expect(page.getByRole('table')).toContainText('Total');
	await capturer(page, 'etats-anomalie', '/etats/tresorerie');
	sql(`UPDATE ligne SET montant_centimes = montant_centimes + 100
		WHERE operation_id = (SELECT id FROM operation WHERE libelle = 'Frais de tenue de compte')`);
	await page.reload();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('5.5 : le Document d’AG, provisoire, balisé, sans terme interdit', async ({ page }) => {
	await page.goto('/etats/document-ag', { waitUntil: 'networkidle' });
	await expect(page.getByTitle(/Aperçu du Document d’AG/)).toBeVisible();
	await expect(page.getByText(/porte le filigrane « Provisoire »/)).toBeVisible();
	await ecranAccessible(page, '/etats/document-ag');
	await capturer(page, 'etats-ag', '/etats/document-ag');

	const d = await telecharger(page, () => page.getByRole('link', { name: 'Télécharger' }).click());
	expect(d.suggestedFilename()).toBe(`document-ag-${jeu.courant}.pdf`);
	const pdf = await octets(d);
	const apercu = await page.request.get('/etats/document-ag/pdf');
	expect(apercu.headers()['x-frame-options']).toBe('SAMEORIGIN');
	expect(apercu.headers()['content-disposition']).toMatch(/^inline/);
	const texte = await textePdf(pdf);
	for (const attendu of [
		'Compte de résultat',
		'État de trésorerie',
		'Provisoire',
		'Évènements',
		'Écarts restants',
		'APE des Tilleuls',
		`Exercice ${jeu.courant}`,
		'Page 1 sur'
	]) {
		expect(texte).toContain(attendu);
	}
	expect(texte).not.toMatch(INTERDITS);
	const brut = Buffer.from(pdf).toString('latin1');
	expect(brut).toContain('/Lang (fr-FR)');
	expect(brut).toContain('/StructTreeRoot');
	expect(brut).toContain('/MarkInfo');
	expect(brut).toMatch(/\/FontFile2/);
});

test('5.6 : le menu Exporter donne les chiffres de l’écran, en PDF et en XLSX', async ({
	page
}) => {
	await page.goto('/etats', { waitUntil: 'networkidle' });
	const montant = await page.getByRole('main').locator('.pied .montant-lg').first().textContent();
	await page.getByRole('button', { name: 'Exporter' }).click();
	const pdf = await telecharger(page, () => page.getByRole('link', { name: 'PDF' }).click());
	expect(pdf.suggestedFilename()).toBe(`compte-de-resultat-${jeu.courant}.pdf`);
	const texte = await textePdf(await octets(pdf));
	expect(texte.replace(/\s/g, '')).toContain((montant as string).replace(/\s/g, ''));
	expect(texte).not.toMatch(INTERDITS);

	await page.getByRole('button', { name: 'Exporter' }).click();
	const xlsx = await telecharger(page, () => page.getByRole('link', { name: /XLSX/ }).click());
	expect(xlsx.suggestedFilename()).toBe(`compte-de-resultat-${jeu.courant}.xlsx`);
	const archive = unzipSync(await octets(xlsx));
	const feuille = strFromU8(archive['xl/worksheets/sheet1.xml'] as Uint8Array);
	const partages = strFromU8((archive['xl/sharedStrings.xml'] ?? new Uint8Array()) as Uint8Array);
	const styles = strFromU8(archive['xl/styles.xml'] as Uint8Array);
	expect(feuille).toMatch(/<c [^>]*><v>-?\d+(\.\d{1,2})?<\/v><\/c>/);
	expect(styles).toContain('€');
	expect(`${feuille}${partages}`).not.toMatch(INTERDITS);

	for (const url of [
		`/etats/export?etat=tresorerie&format=xlsx`,
		`/etats/export?etat=actions&format=pdf`,
		`/etats/export?etat=action&id=${jeu.kermesse}&format=pdf`
	]) {
		const r = await page.request.get(url);
		expect(r.ok()).toBe(true);
	}
	expect((await page.request.get('/etats/export?etat=autre&format=pdf')).status()).toBe(404);
	expect((await page.request.get('/etats/export?etat=action&id=9999&format=pdf')).status()).toBe(
		400
	);
});

test('5.7 : un ZIP lisible sans l’outil', async ({ page }) => {
	await page.goto('/reglages/sauvegardes', { waitUntil: 'networkidle' });
	await capturer(page, 'sauvegardes', '/reglages/sauvegardes');
	await ecranAccessible(page, '/reglages/sauvegardes');
	const d = await telecharger(page, () =>
		page.getByRole('link', { name: 'Export complet' }).click()
	);
	expect(d.suggestedFilename()).toMatch(/^export-complet-\d{4}-\d{2}-\d{2}\.zip$/);
	const archive = unzipSync(await octets(d));
	expect(Object.keys(archive).sort()).toEqual([
		'LISEZMOI.txt',
		'lignes.csv',
		'operations.csv',
		'pieces/0001-facture-autocars-fictive.pdf',
		'pointages.csv'
	]);
	for (const csv of ['operations.csv', 'lignes.csv', 'pointages.csv']) {
		expect([...(archive[csv] as Uint8Array).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
	}
	const operations = strFromU8(archive['operations.csv'] as Uint8Array);
	expect(operations).toContain(';');
	expect(operations).toMatch(/Autocars du Vallon;-1000,00;/);
	expect(operations).toContain('pieces/0001-facture-autocars-fictive.pdf');
	expect(`${operations}${strFromU8(archive['lignes.csv'] as Uint8Array)}`).not.toMatch(INTERDITS);
});

test('5.8 : E3, le plus ancien d’abord', async ({ page }) => {
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const id = b.prepare('SELECT id FROM exercice WHERE libelle = ?').pluck().get(jeu.courant);
	b.close();
	await page.goto(`/reglages/exercices/${id}/cloture`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('alert')).toContainText(
		'Clôturez d’abord l’Exercice le plus ancien.'
	);
	await expect(page.getByRole('button', { name: /^Clôturer/ })).toHaveCount(0);
});

test('5.8 : vérifier, confirmer, verrouiller', async ({ page }) => {
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const id = b.prepare('SELECT id FROM exercice WHERE libelle = ?').pluck().get(jeu.ecoule);
	b.close();
	const chemin = `/reglages/exercices/${id}/cloture`;

	await page.goto('/reglages/exercices', { waitUntil: 'networkidle' });
	await page
		.getByRole('row', { name: new RegExp(jeu.ecoule) })
		.getByRole('link', { name: 'Clôturer' })
		.click();
	await expect(page).toHaveURL(new RegExp(chemin));
	const principal = page.getByRole('main');
	await expect(principal.getByRole('link', { name: /Écarts/ })).toBeVisible();
	await expect(
		principal.getByRole('link', { name: /Lignes de relevé non pointées/ })
	).toBeVisible();
	await expect(principal.getByRole('link', { name: /Pièces manquantes/ })).toBeVisible();
	await capturer(page, 'cloture', chemin);
	await ecranAccessible(page, chemin);
	await capturer(page, 'cloture-dialogue', chemin, async () => {
		await page.getByRole('button', { name: `Clôturer ${jeu.ecoule}` }).click();
		await page.getByRole('dialog').waitFor();
	});

	await page.goto(chemin, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: `Clôturer ${jeu.ecoule}` }).click();
	const dialogue = page.getByRole('alertdialog').or(page.getByRole('dialog'));
	await expect(dialogue).toContainText('Les états seront figés.');
	await expect(dialogue).toContainText(`Les soldes de départ de ${jeu.courant} seront recalculés.`);
	await expect(dialogue).toContainText(/Reste : \d+ Pièces? manquantes?, Écart 0,00.€\./);
	await expect(dialogue.getByRole('button', { name: 'Revenir' })).toBeFocused();
	await dialogue.getByRole('button', { name: `Clôturer ${jeu.ecoule}` }).click();

	await expect(
		principal.getByRole('heading', { name: `${jeu.ecoule} est clôturé.` })
	).toBeVisible();
	const ag = principal.getByRole('link', { name: 'Voir le Document d’AG' });
	await expect(ag).toBeVisible();
	await capturer(page, 'cloture-fin', chemin);
	await ecranAccessible(page, chemin);
	await page.goto(chemin);
	await ag.click();
	await expect(page).toHaveURL(new RegExp(`document-ag\\?exercice=${jeu.ecoule}`));
	await expect(page.getByText(/filigrane/)).toHaveCount(0);
	await expect(page.getByText('Exercice clôturé, lecture seule')).toBeVisible();

	const r = await page.request.get(`/etats/document-ag/pdf?exercice=${jeu.ecoule}`);
	const texte = await textePdf(new Uint8Array(await r.body()));
	expect(texte).not.toContain('Provisoire');
	expect(texte).toContain('Page 1 sur');
});

test('5.8 : un Exercice clôturé refuse les écritures, garde les Pièces', async ({ page }) => {
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const op = b
		.prepare(`SELECT id FROM operation WHERE libelle = 'Autocars du printemps'`)
		.pluck()
		.get();
	b.close();
	await page.goto(`/operations?exercice=${jeu.ecoule}&op=${op}`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('dialog')).toContainText('est clôturé');
	await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' })).toHaveCount(
		0
	);

	expect(() =>
		sql(`UPDATE exercice SET statut = 'ouvert' WHERE libelle = '${jeu.ecoule}'`)
	).toThrow('exercice_cloture');
	expect(() => sql(`UPDATE ligne SET montant_centimes = 1 WHERE operation_id = ${op}`)).toThrow(
		'exercice_cloture'
	);
	// Sans effet sur un état : la dispense de Pièce reste permise.
	sql(`UPDATE operation SET sans_piece = 1 WHERE id = ${op}`);
});

test('5.8 : un Groupe renommé ne change pas les états clôturés', async ({ page }) => {
	sql(`UPDATE groupe SET libelle = 'Fêtes', ordre = 99 WHERE libelle = 'Évènements'`);
	await page.goto(`/etats?exercice=${jeu.ecoule}`, { waitUntil: 'networkidle' });
	const clos = page.getByRole('treegrid').first();
	await expect(clos).toContainText('Évènements');
	await expect(clos).not.toContainText('Fêtes');
	await page.goto(`/etats?exercice=${jeu.courant}`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('treegrid').first()).toContainText('Fêtes');
	sql(`UPDATE groupe SET libelle = 'Évènements', ordre = 1 WHERE libelle = 'Fêtes'`);
});

test('Lecteur·rice : mêmes écrans, sans action ni lien interdit', async ({ page, context }) => {
	await context.clearCookies();
	await context.addCookies([{ name: 'ape_session', value: JETON_LECTEUR, url: ORIGINE }]);
	await page.goto('/', { waitUntil: 'networkidle' });
	const principal = page.getByRole('main');
	await expect(principal.getByRole('link', { name: /Lignes de relevé/ })).toHaveCount(0);
	await expect(principal.getByText('Lignes de relevé à pointer')).toBeVisible();
	await expect(principal.getByRole('link', { name: /Pièces manquantes/ })).toBeVisible();
	await expect(principal.getByRole('article').first().getByRole('link')).toHaveCount(0);
	await expect(principal.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
	await capturer(page, 'tableau-lecteur', '/');
	await page.goto('/actions', { waitUntil: 'networkidle' });
	await expect(page.getByRole('treegrid').first()).toBeVisible();
	const r = await page.request.get('/reglages/sauvegardes/export');
	expect(r.status()).toBe(403);
});

test('5.9 : ape verifier rejoue tout et sort à 0', async () => {
	expect(ape('verifier')).toContain('Tout est juste');
});

test('5.9 : une ligne altérée à la main est signalée, code non nul', async () => {
	sql(`
		DROP TRIGGER ligne_verrou_maj;
		UPDATE ligne SET montant_centimes = montant_centimes - 1
			WHERE operation_id = (SELECT id FROM operation WHERE libelle = 'Autocars du printemps');
	`);
	let sortie = 0;
	let texte = '';
	try {
		ape('verifier');
	} catch (e) {
		const erreur = e as { status: number; stdout: string };
		sortie = erreur.status;
		texte = erreur.stdout;
	}
	expect(sortie).not.toBe(0);
	expect(texte).toContain(jeu.ecoule);
	expect(texte).toContain('Empreinte de clôture');
});
