import type { Page } from '@playwright/test';
import { base } from './aides.ts';

export const panneau = (page: Page) => page.getByRole('dialog').first();
export const montant = (page: Page) => panneau(page).getByLabel('Montant', { exact: true });
export const enregistrer = (page: Page) =>
	panneau(page).getByRole('button', { name: 'Enregistrer', exact: false }).first();

export async function choisir(page: Page, etiquette: string, texte: string) {
	const champ = panneau(page).getByRole('combobox', { name: etiquette });
	await champ.click();
	await champ.fill(texte);
	await panneau(page).getByRole('option', { name: texte, exact: true }).first().click();
}

/** Dépense à une Ligne, saisie comme à la main. */
export async function depense(
	page: Page,
	o: { libelle: string; montant: string; nature?: string; action?: string; date?: string }
) {
	await montant(page).fill(o.montant);
	if (o.date) await panneau(page).getByLabel('Date').fill(o.date);
	await panneau(page).getByLabel('Libellé').fill(o.libelle);
	await choisir(page, 'Nature de la ligne 1', o.nature ?? 'Papeterie');
	if (o.action) await choisir(page, 'Action de la ligne 1', o.action);
}

export async function nouvelleDepense(
	page: Page,
	o: Parameters<typeof depense>[1],
	chemin = '/operations?op=nouvelle'
) {
	await page.goto(chemin);
	await depense(page, o);
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });
}

export function operationId(libelle: string): number {
	const b = base();
	const id = b
		.prepare('SELECT id FROM operation WHERE libelle = ? ORDER BY id DESC LIMIT 1')
		.pluck()
		.get(libelle) as number;
	b.close();
	return id;
}

export function compteId(libelle: string): number {
	const b = base();
	const id = b.prepare('SELECT id FROM compte WHERE libelle = ?').pluck().get(libelle) as number;
	b.close();
	return id;
}

/** Pointe directement le premier Côté d'une Opération : le Pointage arrive avec l'epic 3. */
export function pointerEnBase(operation: number) {
	const b = base();
	const c = b.prepare('SELECT * FROM cote WHERE operation_id = ?').get(operation) as {
		id: number;
		compte_id: number;
		montant_centimes: number;
		date: string;
	};
	const acces = b.prepare('SELECT id FROM acces ORDER BY id DESC LIMIT 1').pluck().get();
	const ligne = b
		.prepare(
			`INSERT INTO ligne_releve (compte_id, date, montant_centimes, libelle, empreinte, cree_le)
			 VALUES (?, ?, ?, 'VIR FICTIF', ?, '2026-10-20T18:00:00.000Z')`
		)
		.run(c.compte_id, c.date, c.montant_centimes, `e-${operation}`).lastInsertRowid;
	const pointage = b
		.prepare(
			`INSERT INTO pointage (compte_id, cree_le, cree_par) VALUES (?, '2026-10-20T18:00:00.000Z', ?)`
		)
		.run(c.compte_id, acces).lastInsertRowid;
	b.prepare('INSERT INTO pointage_cote (pointage_id, cote_id) VALUES (?, ?)').run(pointage, c.id);
	b.prepare('INSERT INTO pointage_ligne (pointage_id, ligne_releve_id) VALUES (?, ?)').run(
		pointage,
		ligne
	);
	b.close();
}
