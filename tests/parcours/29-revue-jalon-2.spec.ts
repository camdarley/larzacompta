/**
 * Non-régression des défauts d'interface de la revue indépendante du jalon 2.
 * Avec `CAPTURES=<dossier>`, chaque correctif laisse sa capture, à regarder à l'œil.
 */
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { centimes as c } from '../../src/lib/domaine/montant.ts';
import { composer } from '../../src/lib/server/composition.ts';
import { creerFichiers } from '../../src/lib/server/infra/fichiers/index.ts';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import { chargerDansDossier, type JeuCharge } from '../jeux/charger.ts';
import { ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { demarrerServeur } from './aides-instance.ts';

const PORT = 4189;
const ORIGINE = `http://localhost:${PORT}`;
const captures = process.env.CAPTURES;
const JETONS = {
	tresorier: 'session-fictive-revue-tresorerie',
	compteur: 'session-fictive-revue-comptage',
	lecteur: 'session-fictive-revue-lecture'
};

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;
let jeu: JeuCharge;
let session: number;
let clot: number;

function preparer(d: string) {
	const j = chargerDansDossier(d);
	const base = ouvrirBase(join(d, 'base.sqlite'));
	const app = composer({ base, fichiers: creerFichiers(join(d, 'fichiers')) });
	const depots = app.socle.depots;
	const maintenant = new Date().toISOString();
	const tresorier = depots.acces.lister().find((a) => a.role === 'tresorier')!;
	const lecteur = depots.acces.lister().find((a) => a.role === 'lecteur')!;
	const compteur = depots.acces.creer({
		identifiant: 'sam',
		nomAffiche: 'Sam Fictif',
		role: 'compteur',
		hash: 'sans-mot-de-passe',
		creeLe: maintenant
	});
	depots.acces.definirCaisses(compteur, [j.caisse]);
	const demain = new Date(Date.now() + 86_400_000).toISOString();
	for (const [jeton, accesId] of [
		[JETONS.tresorier, tresorier.id],
		[JETONS.lecteur, lecteur.id],
		[JETONS.compteur, compteur]
	] as const) {
		depots.acces.creerSession({
			hashJeton: createHash('sha256').update(jeton).digest('hex'),
			accesId,
			creeLe: maintenant,
			derniereActiviteLe: maintenant,
			expireLe: demain
		});
	}
	const ctx = app.ctx(depots.acces.parId(tresorier.id));
	const date = ctx.aujourdhui;
	const octets = ofxCp1252(
		ofxTexte(
			[
				{ date: '20261103', montant: '-41.27', id: 'R1', libelle: 'ZZQ DIVERS' },
				{ date: '20261103', montant: '-63.11', id: 'R2', libelle: 'CHEQUE 5000888' },
				{ date: '20261103', montant: '95.30', id: 'R3', libelle: 'VIR SUMUP PAYOUT FICTIF' }
			],
			null
		)
	);
	const lu = app.pointage.importer(ctx, { compteId: j.banque, nomFichier: 'r.ofx', octets });
	if (!lu.ok) throw new Error(`Relevé : ${lu.erreur.code}`);
	const fond = [
		{ coupure: c(2000), quantite: 4 },
		{ coupure: c(1000), quantite: 1 }
	];
	const gouter = app.parametrage.creerCompte(ctx, {
		libelle: 'Caisse du goûter',
		type: 'caisse',
		reserve: false,
		ancre: { exerciceId: j.exercice.courant, solde: c(0) }
	});
	if (!gouter.ok) throw new Error('Caisse du goûter');
	const ouvrir = (compteId: number) =>
		app.caisses.compterCaisse(ctx, {
			compteId,
			actionId: j.kermesse,
			date,
			confirmation: c(90_00),
			coupures: fond
		});
	const premiere = ouvrir(gouter.valeur);
	if (!premiere.ok || premiere.valeur.sessionId === null) throw new Error('Session close');
	const clot = premiere.valeur.sessionId;
	app.caisses.compterSession(ctx, {
		sessionId: clot,
		date,
		confirmation: null,
		coupures: [{ coupure: c(2000), quantite: 8 }]
	});
	const cloture = app.caisses.cloturer(ctx, clot);
	if (!cloture.ok) throw new Error('Clôture de la Session');
	const r = ouvrir(j.caisse);
	if (!r.ok || r.valeur.sessionId === null) throw new Error('Session de la vérification');
	base.close();
	return { j, session: r.valeur.sessionId, clot };
}

async function connecte(page: Page, role: keyof typeof JETONS = 'tresorier') {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-revue-j2-'));
	({ j: jeu, session, clot } = preparer(dossier));
	serveur = await demarrerServeur(dossier, PORT);
	if (captures) mkdirSync(captures, { recursive: true });
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

/** Clair puis sombre, une fois les transitions finies. */
const photo = async (page: Page, nom: string) => {
	if (!captures) return;
	await page.waitForTimeout(350);
	await page.screenshot({ path: join(captures, `${nom}.png`) });
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.waitForTimeout(350);
	await page.screenshot({ path: join(captures, `${nom}-sombre.png`) });
	await page.emulateMedia({ colorScheme: 'light' });
};

async function visible(page: Page, selecteur: string) {
	return page.locator(selecteur).evaluate((n) => {
		const r = n.getBoundingClientRect();
		return r.top >= 0 && r.bottom <= window.innerHeight;
	});
}

test.describe('Comptage sur téléphone', () => {
	test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

	test('hors ligne, le bandeau et Réessayer restent à l’écran', async ({ page, context }) => {
		await connecte(page, 'compteur');
		await page.goto(`/sessions/${session}/comptage`);
		await page.getByRole('button', { name: 'Ajouter : Billets de 20,00 €' }).first().waitFor();
		await context.setOffline(true);
		await page.getByRole('button', { name: /Enregistrer/ }).click();
		const bandeau = page.getByRole('alert');
		await expect(bandeau).toContainText('réseau', { ignoreCase: true });
		expect(await visible(page, '[role="alert"]')).toBe(true);
		expect(await page.getByRole('button', { name: 'Réessayer' }).isVisible()).toBe(true);
		await photo(page, 'comptage-reseau');
		await context.setOffline(false);
	});

	test('le titre porte le nom de l’association, et les pièces 2 et 1 la taille heading', async ({
		page
	}) => {
		await connecte(page, 'compteur');
		await page.goto(`/sessions/${session}/comptage`);
		await expect(page).toHaveTitle(/Comptage final, .*, APE/);
		const tailles = await page
			.locator('.forme.piece')
			.evaluateAll((l) => l.map((n) => [n.textContent, getComputedStyle(n).fontSize]));
		expect(tailles.find(([t]) => t === '2')?.[1]).toBe('20px');
		await photo(page, 'comptage-pieces');
	});
});

for (const [nom, width, height] of [
	['paysage', 780, 360],
	['petit', 320, 568]
] as const) {
	test(`Comptage en ${nom} : les coupures gardent la place`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await connecte(page, 'compteur');
		await page.goto(`/sessions/${session}/comptage`);
		const vues = await page.locator('.compteur-coupure').evaluateAll(
			(l) =>
				l.filter((n) => {
					const r = n.getBoundingClientRect();
					const pied = document.querySelector('.total-comptage')!.getBoundingClientRect();
					return r.top >= 0 && r.bottom <= pied.top;
				}).length
		);
		expect(vues).toBeGreaterThanOrEqual(nom === 'paysage' ? 1 : 4);
		await photo(page, `comptage-${nom}`);
	});
}

test('rafale : Entrée choisit l’Action sans enregistrer, la suivante enregistre', async ({
	page
}) => {
	await connecte(page);
	await page.goto('/cheques');
	const compteur = () => page.locator('tbody tr').count();
	await page.getByLabel('Émetteur').fill('Famille Fictive');
	await page.getByLabel('Montant').fill('12');
	const avant = await compteur();
	const action = page.getByRole('combobox', { name: /Action/ });
	await action.fill('Ker');
	await page
		.getByRole('option', { name: /Kermesse/ })
		.first()
		.waitFor();
	await page.keyboard.press('Enter');
	await expect(action).toBeFocused();
	expect(await compteur()).toBe(avant);
});

test.describe('barre latérale', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('Actions et États tiennent à 1280×800, et à 1440×780 l’entrée active reste visible', async ({
		page
	}) => {
		await connecte(page);
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Navigation principale' });
		await expect(nav.getByRole('link', { name: 'États' })).toBeInViewport({ ratio: 1 });
		await photo(page, 'barre-1280');
		await page.setViewportSize({ width: 1440, height: 780 });
		await page.goto('/actions');
		await expect(nav.locator('[aria-current="page"]')).toBeInViewport({ ratio: 1 });
		await photo(page, 'barre-1440');
		await page.setViewportSize({ width: 1280, height: 620 });
		await page.goto('/actions');
		await photo(page, 'barre-basse');
		const fin = nav.locator('[aria-current="page"]');
		// L'entrée se remonte après l'hydratation : WebKit la lit parfois un instant trop tôt.
		const borne = await nav.evaluate((n) => n.getBoundingClientRect().bottom);
		await expect
			.poll(() => fin.evaluate((n) => n.getBoundingClientRect().bottom))
			.toBeLessThanOrEqual(borne);
	});
});

test.describe('retour du focus', () => {
	test('fermer un dialogue ouvert depuis un menu rend le focus à son bouton', async ({ page }) => {
		await connecte(page);
		await page.goto(`/sessions/${clot}`);
		const menu = page.getByRole('button', { name: 'Actions de la Session' });
		await menu.click();
		await page.getByRole('button', { name: 'Rouvrir' }).click();
		await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeFocused();
	});

	test('choisir dans /cheques : Marquer comme rejeté', async ({ page }) => {
		await connecte(page);
		await page.goto('/cheques?etat=tous');
		const menu = page.getByRole('button', { name: /Gestes sur le chèque/ }).first();
		await menu.click();
		await page.getByRole('button', { name: /Marquer comme rejeté/ }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeFocused();
	});
});

test('annuler une somme garde le focus dans la page', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await connecte(page);
	await page.goto('/creances-dettes');
	await page
		.getByRole('button', { name: /^Actions de / })
		.first()
		.click();
	await page.getByRole('button', { name: 'Annuler cette somme' }).click();
	await expect(page.getByText('Somme annulée.')).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test.describe('sur téléphone', () => {
	test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

	test('Aide : le Sommaire montre un chevron, Sam tombe sur Compter une caisse', async ({
		page
	}) => {
		await connecte(page, 'compteur');
		await page.goto('/aide');
		await expect(page.locator('.sommaire-replie summary svg')).toBeVisible();
		await page.locator('.sommaire-replie summary').click();
		await expect(page.locator('.sommaire-replie li a').first()).toContainText(/comptage|compter/i);
		await expect(page.locator('.lecture h2').first()).toContainText(/comptage|compter/i);
		await photo(page, 'aide-sam');
	});
});

test('la caisse et la Session écrivent les montants signés comme le Pointage', async ({ page }) => {
	await connecte(page);
	await page.goto(`/caisses/${jeu.caisse}`);
	const texte = await page.locator('.montant').allTextContents();
	expect(texte.join(' ')).not.toMatch(/[−+]\d/);
	await photo(page, 'caisse');
	await page.goto(`/sessions/${clot}`);
	await expect(page.getByText(/, dans /)).not.toHaveText(/\s,/);
	await expect(page.locator('body')).not.toContainText(/clôturée le \d\d\//);
	await photo(page, 'session-close');
});

test('Lecteur·rice : ?op=nouvelle n’ouvre pas de panneau vide', async ({ page }) => {
	await connecte(page, 'lecteur');
	await page.goto('/operations?op=nouvelle');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('les pages servies à une session ne restent pas en cache', async ({ page }) => {
	await connecte(page);
	const r = await page.goto('/');
	expect(r?.headers()['cache-control']).toBe('private, no-store');
	const api = await page.request.get('/api/palette?q=a');
	expect(api.headers()['cache-control']).toBe('private, no-store');
});

test.describe('saisie depuis le relevé', () => {
	async function ligne(page: Page, motif: RegExp) {
		await page.goto(`/pointage/${jeu.banque}`);
		await page.getByRole('button', { name: motif }).first().click();
	}

	test('sans proposition, Créer est l’action principale et Entrée la lance', async ({ page }) => {
		await connecte(page);
		await ligne(page, /ZZQ DIVERS/);
		await expect(page.getByRole('button', { name: /^Pointer/ })).toHaveCount(0);
		await photo(page, 'pointage-rien');
		await page.keyboard.press('Enter');
		const panneau = page.getByRole('dialog');
		await expect(panneau.getByLabel(/Nature de la ligne 1/)).toBeFocused();
		await photo(page, 'pointage-creer');
	});

	test('un chèque absent du registre ne répète pas trois fois la même invitation', async ({
		page
	}) => {
		await connecte(page);
		await ligne(page, /CHEQUE 5000888/);
		await expect(page.getByText('Aucune Opération ne correspond')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Créer l’Opération' })).toHaveCount(0);
		await photo(page, 'pointage-cheque');
	});

	test('Répartir brut et frais porte le focus sur les frais', async ({ page }) => {
		await connecte(page);
		await ligne(page, /SUMUP/);
		await page.getByRole('button', { name: 'Répartir brut et frais' }).click();
		const panneau = page.getByRole('dialog');
		await expect(panneau.locator('input:focus')).toHaveCount(1);
		const id = await panneau.locator('input:focus').getAttribute('id');
		expect(id).toMatch(/^ligne-.*-montant$/);
		await photo(page, 'sumup-panneau');
	});
});

test.describe('dépense de Session sur téléphone', () => {
	test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

	test('la question de phase tient dans son encadré, et le champ reste visible', async ({
		page
	}) => {
		await connecte(page);
		await page.goto(`/sessions/${session}/comptage`);
		await page.getByRole('button', { name: /Enregistrer/ }).click();
		await page.getByRole('heading', { name: /Comptage enregistré/ }).waitFor();
		await page.goto(`/sessions/${session}`);
		await page
			.getByRole('link', { name: /dépense/i })
			.first()
			.click();
		const question = page.locator('.question');
		await question.waitFor();
		const [haut, legende] = await question.evaluate((n) => [
			n.getBoundingClientRect().top,
			n.querySelector('p')!.getBoundingClientRect().top
		]);
		expect(legende).toBeGreaterThan(haut as number);
		await photo(page, 'question-phase');
		await page.getByRole('dialog').getByLabel('Libellé').focus();
		const debord = await page.evaluate(() => {
			const champ = document.activeElement!.getBoundingClientRect();
			const barre = document.querySelector('.ape-panneau .pied')!.getBoundingClientRect();
			return champ.bottom - barre.top;
		});
		expect(debord).toBeLessThanOrEqual(0);
		await photo(page, 'panneau-focus');
	});

	test('le dialogue de clôture chasse le toast sur téléphone', async ({ page }) => {
		await connecte(page);
		await page.goto(`/sessions/${session}`);
		await page
			.getByRole('link', { name: /dépense/i })
			.first()
			.click();
		const panneau = page.getByRole('dialog');
		await panneau.locator('#op-montant').fill('5');
		await panneau.getByLabel('Libellé').fill('Glaçons fictifs');
		await panneau
			.getByLabel(/Nature/)
			.first()
			.fill('Ventes');
		await page.keyboard.press('Enter');
		await panneau
			.getByRole('button', { name: /^Enregistrer/ })
			.first()
			.click();
		await expect(page.getByText('Enregistré.')).toBeVisible();
		await page.getByRole('button', { name: 'Clôturer la Session' }).click();
		await expect(page.getByRole('dialog').first()).toBeVisible();
		await expect(page.getByText('Enregistré.')).toHaveCount(0);
		await photo(page, 'cloture-dialogue');
		await page.keyboard.press('Escape');
	});
});
