/**
 * Story 11.1 : l'Accès en lecture, sur le serveur construit et l'instance de recette. Chaque écran
 * que ce rôle atteint est vérifié, et chaque écriture de l'application lui est tentée directement.
 */
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COMPTES_FICTIFS } from '../jeux/charger.ts';
import { ROUTES } from '../../src/lib/routes.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';
import { demarrerServeur } from './aides-instance.ts';
import {
	ecransLecteur,
	JETONS_V1,
	preparerInstanceV1,
	type InstanceV1,
	type RoleV1
} from './aides-v1.ts';

const PORT = 4193;
const ORIGINE = `http://localhost:${PORT}`;

test.use({ baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
test.describe.configure({ timeout: 60_000 });

let dossier: string;
let serveur: ChildProcess;
let v: InstanceV1;

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-lecture-'));
	v = await preparerInstanceV1(dossier);
	serveur = await demarrerServeur(dossier, PORT);
});

test.afterAll(() => {
	serveur.kill();
	rmSync(dossier, { recursive: true, force: true });
});

async function connecte(page: Page, role: RoleV1 = 'lecteur') {
	await page
		.context()
		.addCookies([
			{ name: 'ape_session', value: JETONS_V1[role], url: ORIGINE, httpOnly: true, sameSite: 'Lax' }
		]);
}

/**
 * Boutons admis dans la page d'un·e lecteur·rice : consulter, filtrer, déplier, exporter. Tout autre
 * bouton est une action de trop : la liste est fermée, un bouton nouveau échoue ici.
 */
const CONSULTATION =
	/^(Fermer|Se déconnecter|Exporter|Comparer à|Filtres?|Tout déplier|Tout replier|Menu|Plus de filtres|Effacer.*|Précédent|Suivant|Déplier.*|Replier.*|Ouvrir .*|Recherche.*|Voir .*|Détail.*)$/;

const boutonsDeTrop = (page: Page) =>
	page.evaluate((source) => {
		const admis = new RegExp(source);
		const zones = [...document.querySelectorAll('main, [role="dialog"]')];
		return zones
			.flatMap((z) => [...z.querySelectorAll('button, [role="button"]')])
			.filter((b) => !b.closest('.aide-terme, [role="row"], tr, .selecteur-exercice'))
			.filter((b) => (b as HTMLElement).offsetParent !== null)
			.map((b) => (b.getAttribute('aria-label') ?? (b as HTMLElement).innerText).trim())
			.filter((nom) => !admis.test(nom));
	}, CONSULTATION.source);

test('un Accès en lecture se crée dans Réglages, et son lien ne sert qu’une fois', async ({
	page,
	browser
}) => {
	await connecte(page, 'tresorier');
	await page.goto('/reglages/acces?acces=nouveau', { waitUntil: 'networkidle' });
	await page.getByLabel('Identifiant').fill('alix');
	await page.getByLabel('Nom affiché').fill('Alix Fictive');
	await page.getByLabel('Rôle').selectOption({ label: 'Lecture' });
	await expect(page.getByRole('group', { name: 'Caisses autorisées' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Créer l’Accès' }).click();
	const lien = (await page.locator('code').textContent()) as string;

	const options = { baseURL: ORIGINE, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } };
	const contexte = await browser.newContext(options);
	const alix = await contexte.newPage();
	await alix.goto(lien);
	await alix.getByLabel('Mot de passe').fill('une relecture attentive');
	await alix.getByRole('button', { name: 'Enregistrer et continuer' }).click();
	await expect(alix).toHaveURL(/\/$/);
	await expect(alix.getByRole('navigation').getByText('Pointage')).toHaveCount(0);
	await contexte.close();

	const deuxieme = await browser.newContext(options);
	const encore = await deuxieme.newPage();
	await encore.goto(lien);
	await expect(encore.getByRole('button', { name: 'Enregistrer et continuer' })).toHaveCount(0);
	await deuxieme.close();

	await page.goto('/reglages/acces', { waitUntil: 'networkidle' });
	await expect(page.getByRole('row', { name: /Alix Fictive/ })).toContainText('Lecture');
});

test('la navigation montre les écrans du rôle, et barre-mobile ses cinq entrées', async ({
	page
}) => {
	await connecte(page);
	await page.goto('/', { waitUntil: 'networkidle' });
	const barre = page.getByRole('complementary');
	for (const entree of [
		'Tableau de contrôle',
		'Opérations',
		'Caisses',
		'Chèques',
		'Créances et Dettes',
		'Pièces',
		'Actions',
		'États',
		'Journal',
		'Aide'
	]) {
		await expect(barre.getByRole('link', { name: entree, exact: true })).toBeVisible();
	}
	for (const interdit of ['Pointage', 'Factures', 'Budget', 'Réglages']) {
		await expect(barre.getByRole('link', { name: interdit, exact: true })).toHaveCount(0);
	}
	await expect(page.getByRole('link', { name: 'Nouvelle Opération' })).toHaveCount(0);

	await page.setViewportSize({ width: 390, height: 780 });
	const mobile = page.getByRole('navigation', { name: 'Navigation mobile' });
	await expect(mobile.getByRole('link')).toHaveText([
		'Contrôle',
		'Actions',
		'États',
		'Pièces',
		'Plus'
	]);
});

test.describe('chaque écran du rôle', () => {
	for (const largeur of [1280, 320]) {
		test(`à ${largeur} px : aucun bouton d’action, aucun cadenas, axe sans violation`, async ({
			page
		}) => {
			test.setTimeout(180_000);
			await page.setViewportSize({ width: largeur, height: largeur === 320 ? 640 : 800 });
			await connecte(page);
			const erreurs: string[] = [];
			page.on('pageerror', (e) => erreurs.push(`${page.url()} : ${String(e)}`));
			for (const e of ecransLecteur(v)) {
				const reponse = await page.goto(e.url, { waitUntil: 'networkidle' });
				expect(reponse?.status(), e.nom).toBe(200);
				expect(await boutonsDeTrop(page), e.nom).toEqual([]);
				await expect(
					page.locator('main svg.lucide-lock, [role="dialog"] svg.lucide-lock')
				).toHaveCount(0);
				await expect(page.locator('main form[method="post"]')).toHaveCount(
					e.url === '/plus' ? 1 : 0
				);
				await axeSansViolation(page);
				expect(await sansDefilementHorizontal(page), e.nom).toBe(true);
			}
			expect(erreurs).toEqual([]);
		});
	}
});

test('le Pointage reste inaccessible, le bloc Mouvement bancaire reste visible (UJ-3)', async ({
	page
}) => {
	await connecte(page);
	for (const url of ['/pointage', `/pointage/${v.banque}`, '/factures', '/budget', '/reglages']) {
		expect((await page.goto(url))?.status(), url).toBe(403);
	}
	await page.goto('/operations?op=4', { waitUntil: 'networkidle' });
	const bloc = page.getByRole('dialog');
	await expect(bloc.getByRole('heading', { name: 'Mouvement bancaire' })).toBeVisible();
	await expect(bloc).toContainText('PAPETERIE DU LAC');
	await expect(bloc.getByRole('link', { name: 'Annuler le Pointage' })).toHaveCount(0);
});

test('une tuile ou un solde vers un écran interdit garde son chiffre, sans lien', async ({
	page
}) => {
	await connecte(page);
	await page.goto('/', { waitUntil: 'networkidle' });
	const principal = page.getByRole('main');
	await expect(principal.getByText('Lignes de relevé à pointer')).toBeVisible();
	await expect(principal.getByRole('link', { name: /Lignes de relevé/ })).toHaveCount(0);
	const banque = principal.getByRole('article').filter({ hasText: 'Banque des Tilleuls' });
	await expect(banque).toContainText('2 337,00'.replace(' ', ' '));
	await expect(banque.getByRole('link')).toHaveCount(0);
	await expect(principal.locator('a[href^="/pointage"], a[href^="/reglages"]')).toHaveCount(0);
});

test('/actions/[id] ne montre ni Sessions de caisse ni Budget', async ({ page }) => {
	await connecte(page, 'tresorier');
	await page.goto(`/actions/${v.kermesse}`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Sessions de caisse' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Budget' })).toBeVisible();

	await page.context().clearCookies();
	await connecte(page);
	await page.goto(`/actions/${v.kermesse}`, { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Kermesse' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sessions de caisse' })).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Budget' })).toHaveCount(0);
	const donnees = await page.request.get(`/actions/${v.kermesse}/__data.json`);
	expect(await donnees.text()).not.toContain('recette_especes');
});

/** Tous les fichiers d'un dossier, sans liste à tenir : une écriture nouvelle entre seule ici. */
function fichiers(dossierRoutes: string): string[] {
	return readdirSync(dossierRoutes, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? fichiers(join(dossierRoutes, e.name)) : [join(dossierRoutes, e.name)]
	);
}

const routeDe = (f: string) => {
	const id = `/${relative('src/routes', f).replace(/\/?\+[^/]+$/, '')}`;
	const url = id.replace(/\/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '1');
	return { id, url: url === '' ? '/' : url };
};

const ecrituresApi = () =>
	fichiers('src/routes')
		.filter((f) => f.endsWith('+server.ts'))
		.flatMap((f) => {
			const source = readFileSync(f, 'utf8');
			return [...source.matchAll(/export (?:async )?(?:const|function) (POST|PUT|PATCH|DELETE)\b/g)]
				.map((m) => ({ ...routeDe(f), methode: m[1] as string }))
				.filter((r) => r.id.startsWith('/api') && ROUTES[r.id] !== 'publique');
		});

const actionsDeFormulaire = () =>
	fichiers('src/routes')
		.filter((f) => f.endsWith('+page.server.ts'))
		.flatMap((f) => {
			const source = readFileSync(f, 'utf8');
			const bloc = source.split(/export const actions\b/)[1];
			if (bloc === undefined) return [];
			const noms = [...bloc.matchAll(/^\t([a-zA-Z]+)(?:: |\()/gm)].map((m) => m[1] as string);
			return (noms.length > 0 ? noms : ['default']).map((nom) => ({ ...routeDe(f), nom }));
		})
		.filter(
			(a) =>
				!a.id.startsWith('/(public)') &&
				// Le mot de passe et le thème sont ceux de la personne.
				a.id !== '/(app)/preferences'
		);

test('chaque écriture appelée directement est refusée côté serveur', async ({ page }) => {
	test.setTimeout(120_000);
	await connecte(page);
	const api = ecrituresApi();
	expect(api.length).toBeGreaterThan(40);
	const passees: string[] = [];
	for (const r of api) {
		const reponse = await page.request.fetch(r.url, {
			method: r.methode,
			headers: { origin: ORIGINE },
			data: {}
		});
		if (reponse.status() !== 403) passees.push(`${r.methode} ${r.url} : ${reponse.status()}`);
	}
	const formulaires = actionsDeFormulaire();
	expect(formulaires.length).toBeGreaterThan(30);
	for (const a of formulaires) {
		const cible = a.nom === 'default' ? a.url : `${a.url}?/${a.nom}`;
		const reponse = await page.request.post(cible, {
			headers: { origin: ORIGINE, 'x-sveltekit-action': 'true', accept: 'application/json' },
			// Une saisie valide : le refus doit venir du droit, pas d'un champ manquant.
			form: {
				id: '1',
				sens: 'creance',
				tiers: 'Mairie fictive',
				motif: 'Essai',
				montant: '100,00',
				date: '2026-10-01',
				note: ''
			}
		});
		const corps = await reponse.text();
		const refuse = reponse.status() === 403 || corps.includes('acces_refuse');
		if (!refuse) passees.push(`POST ${cible} : ${reponse.status()} ${corps.slice(0, 120)}`);
	}
	expect(passees).toEqual([]);
});

test('le Journal n’a rien noté : la lecture n’a laissé aucune trace', async ({ page }) => {
	await page.context().clearCookies();
	await connecte(page);
	await page.goto('/journal', { waitUntil: 'networkidle' });
	await expect(page.getByRole('main')).not.toContainText(COMPTES_FICTIFS.lecteur.nom);
});
