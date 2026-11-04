/**
 * Le vrai Journal vide. Une instance neuve note dès son premier démarrage l'émission du lien
 * initial, et les triggers interdisent de vider le Journal : ce cas ne s'obtient donc pas sur la
 * base des autres parcours. Il tourne sur une seconde instance, dont la base est préparée avant le
 * démarrage : avec un Trésorier déjà là, le serveur n'émet aucun lien et n'écrit rien. Le Journal y
 * est vide pour de bon, triggers en place.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { ouvrirBase } from '../../src/lib/server/infra/sqlite/connexion.ts';
import {
	appliquerMigrations,
	chargerMigrations
} from '../../src/lib/server/infra/sqlite/migrateur.ts';
import { axeSansViolation, sansDefilementHorizontal } from './aides.ts';

const PORT = 4174;
const ORIGINE = `http://localhost:${PORT}`;
const JETON = 'session-fictive-du-journal-vide';
const captures = process.env.CAPTURES;

test.use({ baseURL: ORIGINE });
test.describe.configure({ mode: 'serial' });

let dossier: string;
let serveur: ChildProcess;

async function attendreSante() {
	for (let i = 0; i < 100; i++) {
		const reponse = await fetch(`${ORIGINE}/sante`).catch(() => null);
		if (reponse?.ok) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('La seconde instance ne répond pas.');
}

/** Ni Association ni Exercice : seul de quoi ouvrir une session, sans aucune trace au Journal. */
function preparerBase() {
	const b = ouvrirBase(join(dossier, 'base.sqlite'));
	const maintenant = new Date();
	const demain = new Date(maintenant.getTime() + 86_400_000).toISOString();
	appliquerMigrations(b, chargerMigrations('migrations'), {
		horodatage: maintenant.toISOString()
	});
	const { lastInsertRowid } = b
		.prepare(
			`INSERT INTO acces (identifiant, nom_affiche, role, hash_mot_de_passe, cree_le)
			 VALUES ('vide', 'Personne Fictive', 'tresorier', 'sans-objet-la-session-suffit', ?)`
		)
		.run(maintenant.toISOString());
	b.prepare(
		`INSERT INTO session_connexion (hash_jeton, acces_id, cree_le, derniere_activite_le, expire_le)
		 VALUES (?, ?, ?, ?, ?)`
	).run(
		createHash('sha256').update(JETON).digest('hex'),
		lastInsertRowid,
		maintenant.toISOString(),
		maintenant.toISOString(),
		demain
	);
	b.close();
}

function lignesDuJournal() {
	const b = new Database(join(dossier, 'base.sqlite'), { readonly: true });
	const { n } = b.prepare('SELECT count(*) AS n FROM journal_modification').get() as { n: number };
	const { t } = b
		.prepare(
			`SELECT count(*) AS t FROM sqlite_master
			 WHERE type = 'trigger' AND name IN ('journal_sans_maj', 'journal_sans_suppression')`
		)
		.get() as { t: number };
	b.close();
	return { lignes: n, triggers: t };
}

test.beforeAll(async () => {
	dossier = mkdtempSync(join(tmpdir(), 'ape-compta-journal-vide-'));
	preparerBase();
	serveur = spawn('node', ['build/index.js'], {
		stdio: 'ignore',
		env: {
			...process.env,
			APE_DONNEES: dossier,
			ORIGIN: ORIGINE,
			PROTOCOL_HEADER: 'x-forwarded-proto',
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
	await context.addCookies([{ name: 'ape_session', value: JETON, url: ORIGINE }]);
});

test('un Journal vide affiche l’état prévu, sans filtres ni action', async ({ page }) => {
	await page.goto('/journal');
	expect(lignesDuJournal()).toEqual({ lignes: 0, triggers: 2 });

	const principal = page.getByRole('main');
	await expect(principal.getByRole('heading', { name: 'Rien pour l’instant' })).toBeVisible();
	await expect(principal.getByText('Chaque modification sera notée ici.')).toBeVisible();
	await expect(principal.getByRole('table')).toHaveCount(0);
	await expect(principal.getByRole('form', { name: 'Filtres du Journal' })).toHaveCount(0);
	await expect(principal.getByRole('button')).toHaveCount(0);
	await expect(principal.getByRole('link', { name: 'Tout effacer' })).toHaveCount(0);
	await axeSansViolation(page);
});

test('un filtre sur un Journal vide ramène à l’état prévu par « Tout effacer »', async ({
	page
}) => {
	await page.goto('/journal?type=compte');
	await expect(page.getByRole('heading', { name: 'Rien ne correspond' })).toBeVisible();
	await page.getByRole('link', { name: 'Tout effacer' }).click();
	await expect(page).toHaveURL(/journal$/);
	await expect(page.getByRole('heading', { name: 'Rien pour l’instant' })).toBeVisible();
});

for (const largeur of [320, 390]) {
	test(`l’état vide tient sur un téléphone de ${largeur} px, en clair comme en sombre`, async ({
		page
	}) => {
		await page.setViewportSize({ width: largeur, height: 780 });
		for (const colorScheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme });
			await page.goto('/journal');
			if (colorScheme === 'dark') {
				const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
				expect(fond).toBe('rgb(23, 21, 29)');
			}
			await expect(page.getByRole('heading', { name: 'Rien pour l’instant' })).toBeInViewport();
			expect(await sansDefilementHorizontal(page)).toBe(true);
			await axeSansViolation(page);
		}
	});
}

test('captures de l’état vide', async ({ page }) => {
	test.skip(!captures, 'CAPTURES non défini');
	mkdirSync(captures as string, { recursive: true });
	const formats = [
		['ordinateur', 1280, 800],
		['tablette', 820, 900],
		['telephone', 390, 780]
	] as const;
	for (const [nom, width, height] of formats) {
		await page.setViewportSize({ width, height });
		for (const [theme, colorScheme] of [
			['clair', 'light'],
			['sombre', 'dark']
		] as const) {
			await page.emulateMedia({ colorScheme });
			await page.goto('/journal', { waitUntil: 'networkidle' });
			await page.evaluate(() => document.fonts.ready);
			await page.waitForTimeout(250);
			await page.screenshot({
				path: join(captures as string, `journal-vide-${nom}-${theme}.png`)
			});
		}
	}
});
