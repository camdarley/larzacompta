/**
 * Captures d'écran pour relecture à l'œil, sautées par défaut.
 * `CAPTURES=/chemin/dossier pnpm exec playwright test 99-captures` : ordinateur et téléphone, clair et sombre.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { base, connecter } from './aides.ts';

const dossier = process.env.CAPTURES;
/** Restreint les captures aux écrans dont le nom correspond. */
const filtre = new RegExp(process.env.CAPTURES_FILTRE ?? '.');

const FORMATS = [
	{ nom: 'ordinateur', largeur: 1280, hauteur: 800 },
	{ nom: 'tablette', largeur: 820, hauteur: 900 },
	{ nom: 'telephone', largeur: 390, hauteur: 780 }
];
// La préférence « Système » du compte l'emporte sur le cookie à l'hydratation : on émule le système.
const THEMES = [
	['clair', 'light'],
	['sombre', 'dark']
] as const;

const ECRANS: [string, string][] = [
	['tableau', '/'],
	['operations', '/operations'],
	['operations-recherche', '/operations?q=autocars'],
	['operations-vide', '/operations?q=zzz'],
	['operation-nouvelle', '/operations?op=nouvelle'],
	['aide', '/aide'],
	['journal', '/journal'],
	['journal-filtre', '/journal?type=compte'],
	['plus', '/plus'],
	['preferences', '/preferences'],
	['reglages', '/reglages'],
	['comptes', '/reglages/comptes'],
	['compte-nouveau', '/reglages/comptes?compte=nouveau'],
	['natures', '/reglages/natures'],
	['actions', '/reglages/actions'],
	['groupes', '/reglages/groupes'],
	['acces', '/reglages/acces'],
	['acces-nouveau', '/reglages/acces?acces=nouveau'],
	['exercices', '/reglages/exercices'],
	['nature-systeme', '/reglages/natures?nature=1'],
	['refus', '/page-inconnue'],
	['bienvenue-1', '/bienvenue?etape=1'],
	['bienvenue-2', '/bienvenue?etape=2'],
	['bienvenue-3', '/bienvenue?etape=3'],
	['bienvenue-fin', '/bienvenue?etape=fin']
];

function compteDe(libelle: string) {
	const b = base();
	const id = b.prepare('SELECT id FROM compte WHERE libelle = ?').pluck().get(libelle);
	b.close();
	return id;
}

/** La file vivante et les autres états du Pointage, posés par `16-pointage.spec.ts`. */
function ecransPointage(): [string, string][] {
	const vivant = compteDe('CCP imaginaire');
	if (!vivant) return [];
	return [
		['pointage-file', `/pointage/${vivant}`],
		['pointage-causes', `/pointage/${vivant}?causes=1`],
		['pointage-saisir', `/pointage/${vivant}?saisir=ligne`],
		['pointage-solde', `/pointage/${vivant}?saisir=solde`],
		['pointage-fin', `/pointage/${compteDe('Banque du parcours')}`],
		['pointage-ecart-restant', `/pointage/${compteDe('Banque imaginaire')}`],
		['pointage-vide', `/pointage/${compteDe('Compte courant')}`]
	];
}

function ligneDe(libelle: string) {
	const b = base();
	const id = b.prepare('SELECT id FROM ligne_releve WHERE libelle = ?').pluck().get(libelle);
	b.close();
	return id;
}

function idDe(libelle: string) {
	const b = base();
	const id = b.prepare('SELECT id FROM operation WHERE libelle = ?').pluck().get(libelle);
	b.close();
	return id;
}

/** Écrans qui n'existent qu'une fois les parcours Opération joués. */
function ecransOperation(): [string, string][] {
	const op = (nom: string, libelle: string, avant = ''): [string, string] => [
		nom,
		`/operations?${avant}op=${idDe(libelle)}`
	];
	return [
		op('op-repartie', 'Autocars du Sud'),
		op('op-pointee', 'Pointée, libellé corrigé'),
		op('op-cloturee', 'Autocars de mars', 'exercice=2025-2026&'),
		op('op-annulee', 'Saisie par erreur'),
		op('op-interne', 'Virement de Compte courant vers Livret'),
		op('op-compensee', 'Photographe imaginaire'),
		op('op-somme', 'Rendu : Trop-perçu famille fictive'),
		['nouvelle-interne', '/operations?op=nouvelle&intention=interne'],
		['nouvelle-compensee', '/operations?op=nouvelle&intention=compensee'],
		['nouvelle-somme', '/operations?op=nouvelle&intention=somme'],
		['nouvelle-remboursement', '/operations?op=nouvelle&intention=remboursement'],
		['filtres-telephone', '/operations?filtres=1']
	];
}

async function photographier(page: Page, nom: string) {
	if (!dossier) return;
	await page.waitForLoadState('networkidle');
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(250);
	await page.screenshot({ path: join(dossier, `${nom}.png`) });
}

test.describe('captures', () => {
	test.skip(!dossier, 'CAPTURES non défini');
	test.setTimeout(240_000);

	test('écrans', async ({ page, browser }) => {
		mkdirSync(dossier as string, { recursive: true });
		await connecter(page);
		for (const format of FORMATS) {
			for (const [theme, colorScheme] of THEMES) {
				await page.emulateMedia({ colorScheme });
				await page.setViewportSize({ width: format.largeur, height: format.hauteur });
				const avecOperations = idDe('Autocars du Sud') ? ecransOperation() : [];
				for (const [nom, chemin] of [...ECRANS, ...avecOperations, ...ecransPointage()].filter(
					([n]) => filtre.test(n)
				)) {
					await page.goto(chemin);
					await photographier(page, `${nom}-${format.nom}-${theme}`);
				}
			}
		}
		// États qui ne s'atteignent que par un geste : liste ouverte, bulle, palette, reste.
		for (const format of FORMATS.filter((f) => f.nom !== 'tablette' && filtre.test('geste'))) {
			for (const [theme, colorScheme] of THEMES) {
				await page.emulateMedia({ colorScheme });
				await page.setViewportSize({ width: format.largeur, height: format.hauteur });
				const suffixe = `${format.nom}-${theme}`;

				await page.goto('/operations?op=nouvelle', { waitUntil: 'networkidle' });
				const d = page.getByRole('dialog');
				await d.getByLabel('Montant', { exact: true }).fill('1000');
				await d.getByLabel('Libellé').fill('Autocars Bleus');
				await d.getByRole('combobox', { name: 'Nature de la ligne 1' }).waitFor();
				await page.waitForTimeout(400);
				await photographier(page, `geste-suggestion-${suffixe}`);
				await d.getByLabel('Montant de la ligne 1').fill('600');
				await d.getByLabel('Montant de la ligne 1').blur();
				await photographier(page, `geste-reste-${suffixe}`);
				await d.getByLabel('Montant de la ligne 1').fill('1050');
				await d.getByLabel('Montant de la ligne 1').blur();
				await photographier(page, `geste-trop-${suffixe}`);
				await d.getByLabel('Montant de la ligne 1').fill('600');
				await d.getByRole('button', { name: 'Actions de la ligne 1' }).click();
				await photographier(page, `geste-menu-ligne-${suffixe}`);
				await d.getByRole('button', { name: 'Dupliquer' }).click();
				const action = d.getByRole('combobox', { name: 'Action de la ligne 2' });
				await action.click();
				await action.fill('o');
				await photographier(page, `geste-liste-${suffixe}`);
				await action.press('Escape');

				await page.goto('/operations', { waitUntil: 'networkidle' });
				await page.keyboard.press('Control+k');
				await page.getByRole('dialog').getByRole('combobox').fill('250');
				await page.waitForTimeout(400);
				await photographier(page, `geste-palette-${suffixe}`);
				await page.keyboard.press('Escape');
				await page.getByRole('button', { name: 'Qu’est-ce qu’une Opération ?' }).focus();
				await photographier(page, `geste-aide-terme-${suffixe}`);
				await page.keyboard.press('Escape');
				await page.getByRole('heading', { level: 1 }).click();
				await page.keyboard.type('?');
				await photographier(page, `geste-raccourcis-${suffixe}`);
				await page.keyboard.press('Escape');
			}
		}
		// Pointage : écran de correspondance, panneau prérempli, propositions sélectionnées.
		for (const format of FORMATS.filter((f) => f.nom === 'ordinateur')) {
			for (const [theme, colorScheme] of THEMES) {
				if (!filtre.test('pointage-geste') || !compteDe('CCP imaginaire')) continue;
				await page.emulateMedia({ colorScheme });
				await page.setViewportSize({ width: format.largeur, height: format.hauteur });
				const suffixe = `${format.nom}-${theme}`;
				const vivant = compteDe('CCP imaginaire');
				await page.goto(
					`/pointage/${vivant}?op=nouvelle&releve=${ligneDe('FRAIS TENUE DE COMPTE')}`,
					{
						waitUntil: 'networkidle'
					}
				);
				await photographier(page, `pointage-geste-creer-${suffixe}`);
				await page.goto(`/pointage/${vivant}?ligne=${ligneDe('REMISE CHEQUES ECOLE FICTIVE')}`, {
					waitUntil: 'networkidle'
				});
				await page.keyboard.press('r');
				await page.keyboard.type('a');
				await page.waitForTimeout(400);
				await photographier(page, `pointage-geste-relier-${suffixe}`);
				await page.goto(`/pointage/${compteDe('Banque trouée')}`, { waitUntil: 'networkidle' });
				await page
					.locator('input[type=file]')
					.first()
					.setInputFiles({
						name: 'releve-fictif.csv',
						mimeType: 'text/csv',
						buffer: Buffer.from(
							'Date;Libellé;Référence;Sorties;Entrées\n12/10/2027;Intérêts imaginaires;R1;;1 234,56\n13/10/2027;Frais imaginaires;R2;3,50;\n15/10/2027;Cotisation fictive;R3;12,00;\n'
						)
					});
				await photographier(page, `pointage-geste-csv-${suffixe}`);
			}
		}
		if (process.env.CAPTURES_FILTRE) return;
		const invite = await browser.newContext({
			baseURL: test.info().project.use.baseURL,
			extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
		});
		const anonyme = await invite.newPage();
		for (const format of FORMATS) {
			await anonyme.setViewportSize({ width: format.largeur, height: format.hauteur });
			await anonyme.goto('/connexion');
			await photographier(anonyme, `connexion-${format.nom}-clair`);
			await anonyme.goto('/invitation/lien-inconnu');
			await photographier(anonyme, `invitation-refus-${format.nom}-clair`);
		}
		await invite.close();

		// Lien à usage unique et dialogue de révocation, avec leurs vrais contenus.
		await page.emulateMedia({ colorScheme: 'light' });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/reglages/acces?acces=nouveau');
		await page.getByLabel('Identifiant').fill(`capture${Date.now()}`);
		await page.getByLabel('Nom affiché').fill('Personne Fictive');
		await page.getByRole('button', { name: 'Créer l’Accès' }).click();
		await page.locator('code').waitFor();
		await photographier(page, 'acces-lien-ordinateur-clair');
		await page.getByRole('button', { name: 'Fermer' }).last().click();
		await page.getByRole('button', { name: 'Révoquer' }).first().click();
		await photographier(page, 'acces-revoquer-ordinateur-clair');
		await page.setViewportSize({ width: 390, height: 780 });
		await photographier(page, 'acces-revoquer-telephone-clair');
	});
});
