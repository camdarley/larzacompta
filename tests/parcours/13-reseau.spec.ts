import { expect, test } from '@playwright/test';
import { axeSansViolation, base, connecter, TRESORIER } from './aides.ts';
import { depense, enregistrer, panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await connecter(page);
	await page.goto('/operations?op=nouvelle');
});

const combien = (libelle: string) => {
	const b = base();
	const n = b.prepare('SELECT count(*) FROM operation WHERE libelle = ?').pluck().get(libelle);
	b.close();
	return n;
};

test('2.6 : coupure à l’envoi : le bandeau, la saisie reste, Réessayer enregistre une fois', async ({
	page
}) => {
	await depense(page, { libelle: 'Saisie en coupure', montant: '11', date: '2027-10-18' });
	await page.route('**/api/operations', (r) => r.abort('internetdisconnected'));
	await enregistrer(page).click();
	await expect(panneau(page).getByRole('alert')).toContainText(
		'Pas de réseau pour l’instant. Votre saisie reste sur cet écran.'
	);
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Saisie en coupure');
	await axeSansViolation(page);

	await page.unroute('**/api/operations');
	await panneau(page).getByRole('button', { name: 'Réessayer' }).click();
	await expect(page).not.toHaveURL(/op=/);
	expect(combien('Saisie en coupure')).toBe(1);
});

test('2.6 : la réponse se perd après l’écriture : Réessayer n’enregistre pas deux fois', async ({
	page
}) => {
	await depense(page, { libelle: 'Réponse perdue', montant: '12', date: '2027-10-18' });
	await page.route('**/api/operations', async (r) => {
		await r.fetch();
		await r.abort('connectionreset');
	});
	await enregistrer(page).click();
	await expect(panneau(page).getByRole('alert')).toContainText('Pas de réseau');
	await expect(panneau(page).getByRole('button', { name: 'Réessayer' })).toBeVisible();
	expect(combien('Réponse perdue')).toBe(1);

	await page.unroute('**/api/operations');
	await panneau(page).getByRole('button', { name: 'Réessayer' }).click();
	await expect(page).not.toHaveURL(/op=/);
	expect(combien('Réponse perdue')).toBe(1);
});

test('2.6 : session expirée : on se reconnecte sans recharger, la saisie est intacte', async ({
	page,
	context
}) => {
	await depense(page, { libelle: 'Saisie du soir', montant: '13', date: '2027-10-18' });
	await context.clearCookies({ name: 'ape_session' });
	await enregistrer(page).click();

	const dialogue = page.getByRole('dialog', { name: 'Reconnectez-vous' });
	await expect(dialogue).toContainText('Votre session a expiré par sécurité.');
	await expect(dialogue.getByLabel('Mot de passe')).toBeFocused();
	await axeSansViolation(page);

	await dialogue.getByLabel('Mot de passe').fill('mauvais mot de passe');
	await dialogue.getByRole('button', { name: 'Se reconnecter' }).click();
	await expect(dialogue.getByRole('alert')).toContainText('Identifiant ou mot de passe incorrect.');

	await dialogue.getByLabel('Mot de passe').fill(TRESORIER.motDePasse);
	await dialogue.getByRole('button', { name: 'Se reconnecter' }).click();
	await expect(dialogue).toHaveCount(0);
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Saisie du soir');
	await expect(panneau(page).getByLabel('Montant de la ligne 1')).toHaveValue('13,00');

	await enregistrer(page).click();
	await expect(page).not.toHaveURL(/op=/);
	expect(combien('Saisie du soir')).toBe(1);
});

test('2.6 : erreur 500 : le message prévu, sans code technique', async ({ page }) => {
	await depense(page, { libelle: 'Saisie en erreur', montant: '14', date: '2027-10-18' });
	await page.route('**/api/operations', (r) =>
		r.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"erreur_serveur"}' })
	);
	await enregistrer(page).click();
	const alerte = panneau(page).getByRole('alert');
	await expect(alerte).toContainText('Quelque chose n’a pas fonctionné de notre côté.');
	await expect(alerte).not.toContainText('500');
	await expect(alerte).not.toContainText('erreur_serveur');
	await expect(panneau(page).getByLabel('Libellé')).toHaveValue('Saisie en erreur');
	await page.unroute('**/api/operations');
	await panneau(page).getByRole('button', { name: 'Réessayer' }).click();
	await expect(page).not.toHaveURL(/op=/);
});

test('2.6 : un refus du serveur s’affiche sous le champ fautif', async ({ page }) => {
	await depense(page, { libelle: 'Date hors Exercice', montant: '15', date: '2030-01-15' });
	await enregistrer(page).click();
	await expect(
		panneau(page).getByText('Cette date ne tombe dans aucun Exercice ouvert.')
	).toBeVisible();
	await expect(panneau(page).getByLabel('Date')).toBeFocused();
});
