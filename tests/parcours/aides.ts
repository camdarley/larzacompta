import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { DOSSIER_E2E, ORIGINE_E2E } from './config.ts';

export const TRESORIER = {
	identifiant: 'camille',
	nom: 'Camille Fictive',
	motDePasse: 'cahier de comptes fictif'
};

const envCli = {
	...process.env,
	APE_DONNEES: DOSSIER_E2E,
	ORIGIN: ORIGINE_E2E,
	TZ: 'Europe/Paris'
};

export function ape(...args: string[]): string {
	return execFileSync('node', ['build/cli/ape.js', ...args], {
		env: envCli,
		encoding: 'utf8'
	}).trim();
}

/** Accès direct à la base temporaire : réservé à la mise en place d'un cas de test. */
export function base() {
	return new Database(join(DOSSIER_E2E, 'base.sqlite'));
}

export function effacerTentatives() {
	const b = base();
	b.exec('DELETE FROM tentative_connexion');
	b.close();
}

export async function connecter(
	page: Page,
	a: { identifiant: string; motDePasse: string } = TRESORIER
) {
	effacerTentatives();
	await page.goto('/connexion');
	await page.getByLabel('Identifiant').fill(a.identifiant);
	await page.getByLabel('Mot de passe', { exact: true }).fill(a.motDePasse);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).not.toHaveURL(/connexion/);
}

export async function axeSansViolation(page: Page) {
	const r = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(r.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual(
		[]
	);
}

export function sansDefilementHorizontal(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
	);
}
