import { expect, test, type Page } from '@playwright/test';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import { enregistrer, depense, nouvelleDepense, operationId, panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

const pdf = (nom: string, contenu = 'fictif') => ({
	name: nom,
	mimeType: 'application/pdf',
	buffer: Buffer.from(`%PDF-1.4\n%${contenu}\n`)
});
/** Une vraie image, dessinée par le navigateur. */
async function png(page: Page, nom: string) {
	const octets = await page.evaluate(async () => {
		const toile = document.createElement('canvas');
		toile.width = 800;
		toile.height = 1000;
		const c = toile.getContext('2d') as CanvasRenderingContext2D;
		c.fillStyle = '#f8f4e8';
		c.fillRect(0, 0, 800, 1000);
		c.fillStyle = '#333';
		c.font = '48px sans-serif';
		for (let i = 1; i < 12; i++) c.fillText(`Article fictif ${i}`, 80, i * 80);
		const blob = await new Promise<Blob>((r) => toile.toBlob((b) => r(b as Blob), 'image/png'));
		return [...new Uint8Array(await blob.arrayBuffer())];
	});
	return { name: nom, mimeType: 'image/png', buffer: Buffer.from(octets) };
}

function piece(nom: string) {
	const b = base();
	const p = b.prepare('SELECT * FROM piece WHERE nom_original = ?').get(nom) as
		{ id: number; sha256: string; mime: string } | undefined;
	b.close();
	return p;
}

function pieceDeJpeg() {
	const b = base();
	const p = b.prepare('SELECT * FROM piece ORDER BY id DESC LIMIT 1').get() as {
		id: number;
		sha256: string;
		mime: string;
		nom_original: string;
	};
	b.close();
	return p;
}

/** Une vraie photo de 3000 px, avec un segment EXIF fictif de position. */
async function photoAvecExif(page: Page) {
	const octets = await page.evaluate(async () => {
		const toile = document.createElement('canvas');
		toile.width = 3000;
		toile.height = 1500;
		const c = toile.getContext('2d') as CanvasRenderingContext2D;
		c.fillStyle = '#884488';
		c.fillRect(0, 0, 3000, 1500);
		const blob = await new Promise<Blob>((r) => toile.toBlob((b) => r(b as Blob), 'image/jpeg'));
		return [...new Uint8Array(await blob.arrayBuffer())];
	});
	const charge = Buffer.from('Exif\0\0GPSLatitude 43.0 fictive');
	const taille = charge.length + 2;
	const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, taille >> 8, taille & 0xff]), charge]);
	const jpeg = Buffer.from(octets);
	return {
		name: 'ticket-gps.jpg',
		mimeType: 'image/jpeg',
		buffer: Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)])
	};
}

const zoneDepot = (page: Page) => panneau(page).locator('input[type=file]').first();

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await connecter(page);
});

test('4.1 : une Pièce déposée pendant la saisie part avec l’Opération', async ({ page }) => {
	await page.goto('/operations?op=nouvelle', { waitUntil: 'networkidle' });
	await depense(page, { libelle: 'Ramettes de papier', montant: '30' });
	await zoneDepot(page).setInputFiles(pdf('facture-ramettes.pdf'));
	await expect(panneau(page).getByText('facture-ramettes.pdf', { exact: true })).toBeVisible();
	await enregistrer(page).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });

	const id = operationId('Ramettes de papier');
	await page.goto(`/operations?op=${id}`, { waitUntil: 'networkidle' });
	await expect(panneau(page).getByText('facture-ramettes.pdf', { exact: true })).toBeVisible();
	await axeSansViolation(page);
});

test('4.1 : un fichier refusé dit pourquoi, et rien n’est gardé', async ({ page }) => {
	await page.goto('/operations?op=nouvelle', { waitUntil: 'networkidle' });
	await zoneDepot(page).setInputFiles({
		name: 'faux.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('<html>pas un PDF</html>')
	});
	await expect(panneau(page).getByRole('alert')).toContainText(
		'Cette photo pèse plus de 20 Mo ou n’est ni un PDF, ni une image.'
	);
	expect(piece('faux.pdf')).toBeUndefined();

	await zoneDepot(page).setInputFiles({
		name: 'lourd.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 0x20)
	});
	await expect(panneau(page).getByRole('alert')).toContainText('20 Mo');
	expect(piece('lourd.pdf')).toBeUndefined();
});

test('4.1 : le même fichier déposé deux fois reste une seule Pièce', async ({ page }) => {
	for (const libelle of ['Copie une', 'Copie deux', 'Copie trois']) {
		await nouvelleDepense(page, { libelle, montant: '12' });
		await page.goto(`/operations?op=${operationId(libelle)}`, { waitUntil: 'networkidle' });
		await zoneDepot(page).setInputFiles(pdf('commune.pdf', 'commune'));
		await expect(panneau(page).getByText('commune.pdf', { exact: true })).toBeVisible();
	}
	const b = base();
	const n = b
		.prepare(`SELECT count(*) FROM piece WHERE nom_original = 'commune.pdf'`)
		.pluck()
		.get();
	b.close();
	expect(n).toBe(1);
	await expect(panneau(page).getByRole('link', { name: /sert aussi/ })).toHaveText(
		'Cette Pièce sert aussi à 2 autres Opérations'
	);
	await panneau(page)
		.getByRole('link', { name: /sert aussi/ })
		.click();
	await expect(page).toHaveURL(/\/pieces\/toutes\?piece=/);
	await expect(page.getByRole('region', { name: 'Opérations justifiées' })).toContainText(
		'Copie trois'
	);
});

test('4.1 : /fichiers exige une session et pose ses en-têtes', async ({ page, browser }) => {
	const { sha256 } = piece('commune.pdf') as { sha256: string };
	const r = await page.request.get(`/fichiers/${sha256}`);
	expect(r.status()).toBe(200);
	const h = r.headers();
	expect(h['content-disposition']).toContain('inline');
	expect(h['content-type']).toBe('application/pdf');
	expect(h['x-content-type-options']).toBe('nosniff');
	expect(h['cache-control']).toBe('private, no-store');
	expect(h['content-security-policy']).toBe("frame-ancestors 'self'");
	const d = await page.request.get(`/fichiers/${sha256}?telecharger`);
	expect(d.headers()['content-disposition']).toContain('attachment');
	expect((await page.request.get('/fichiers/inconnu')).status()).toBe(404);
	expect((await page.request.get(`/fichiers/${'0'.repeat(64)}`)).status()).toBe(400);

	const anonyme = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
	const v = await anonyme.request.get(`http://localhost:4173/fichiers/${sha256}`, {
		maxRedirects: 0
	});
	expect(v.status()).toBe(303);
	expect(v.headers().location).toContain('/connexion');
	await anonyme.close();
});

test('4.1 : apercu-piece ouvre une image en grand, un PDF dans le panneau', async ({ page }) => {
	const id = operationId('Ramettes de papier');
	await page.goto(`/operations?op=${id}`, { waitUntil: 'networkidle' });
	await zoneDepot(page).setInputFiles(await png(page, 'ticket-ramettes.png'));
	await expect(panneau(page).getByText('ticket-ramettes.jpg', { exact: true })).toBeVisible();

	await panneau(page).getByRole('button', { name: 'Ouvrir ticket-ramettes.jpg' }).click();
	await expect(panneau(page).getByRole('img', { name: 'ticket-ramettes.jpg' })).toBeVisible();
	await expect(panneau(page).getByRole('link', { name: 'Télécharger' })).toBeVisible();
	await panneau(page).getByRole('button', { name: 'Agrandir' }).click();
	await expect(panneau(page).getByRole('button', { name: 'Ajuster' })).toBeVisible();
	// Safari ne donne pas le focus à un bouton cliqué : Échap doit marcher sans lui.
	await page.evaluate(() => (document.activeElement as HTMLElement).blur());
	await page.keyboard.press('Escape');
	await expect(panneau(page).getByRole('img', { name: 'ticket-ramettes.jpg' })).toHaveCount(0);
	await expect(panneau(page)).toBeVisible();

	await panneau(page).getByRole('button', { name: 'Ouvrir facture-ramettes.pdf' }).click();
	const cadre = panneau(page).locator('iframe');
	await expect(cadre).toBeVisible();
	await expect(cadre).toHaveAttribute('src', /\/fichiers\//);
	await panneau(page).getByRole('button', { name: 'Retour' }).click();

	// Sur téléphone, un PDF s'ouvre dans un nouvel onglet.
	await page.setViewportSize({ width: 390, height: 780 });
	const lien = panneau(page).getByRole('link', { name: 'Ouvrir facture-ramettes.pdf' });
	await expect(lien).toHaveAttribute('target', '_blank');
});

test('4.1 : un rattachement s’annule par toast', async ({ page }) => {
	const id = operationId('Copie une');
	await page.goto(`/operations?op=${id}`, { waitUntil: 'networkidle' });
	await zoneDepot(page).setInputFiles(pdf('annulable.pdf', 'annulable'));
	await expect(panneau(page).getByText('annulable.pdf', { exact: true })).toBeVisible();
	await panneau(page).getByRole('button', { name: 'Annuler' }).click();
	await expect(panneau(page).getByText('annulable.pdf', { exact: true })).toHaveCount(0);
});

test('AD-5 : Pièce et dispense restent permises sur un Exercice clôturé', async ({ page }) => {
	const id = operationId('Autocars de mars');
	await page.goto(`/operations?exercice=2025-2026&op=${id}`, { waitUntil: 'networkidle' });
	await expect(panneau(page).getByText('clôturé')).toBeVisible();
	await zoneDepot(page).setInputFiles(pdf('cloture.pdf', 'cloture'));
	await expect(panneau(page).getByText('cloture.pdf', { exact: true })).toBeVisible();
	await panneau(page).getByRole('button', { name: 'Retirer cloture.pdf' }).click();
	await expect(panneau(page).getByText('cloture.pdf', { exact: true })).toHaveCount(0);

	await panneau(page).getByLabel('Pas besoin de Pièce').check();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.reload({ waitUntil: 'networkidle' });
	await expect(panneau(page).getByLabel('Pas besoin de Pièce')).toBeChecked();
	const b = base();
	const sans = b.prepare('SELECT sans_piece FROM operation WHERE id = ?').pluck().get(id);
	b.close();
	expect(sans).toBe(1);
	await panneau(page).getByLabel('Pas besoin de Pièce').uncheck();
	await expect(panneau(page).getByLabel('Pas besoin de Pièce')).not.toBeChecked();
});

test('4.1 : le filtre « présence de Pièce » suit les Pièces', async ({ page }) => {
	await page.goto('/operations?piece=avec&q=ramettes');
	await expect(page.getByRole('link', { name: 'Ramettes de papier' })).toBeVisible();
	await page.goto('/operations?piece=sans&q=ramettes');
	await expect(page.getByRole('link', { name: 'Ramettes de papier' })).toHaveCount(0);
});

test('4.2 : Manquantes, dépôt sur la rangée, « Pas besoin de Pièce »', async ({ page }) => {
	await nouvelleDepense(page, { libelle: 'Ticket égaré', montant: '8' });
	await nouvelleDepense(page, { libelle: 'Frais de tenue', montant: '3' });

	await page.goto('/pieces', { waitUntil: 'networkidle' });
	const compteur = page.getByRole('link', { name: /^Pièces/ }).first();
	await expect(compteur).toContainText('à traiter');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pièces');
	await axeSansViolation(page);

	const rangee = page.getByRole('row', { name: /Ticket égaré/ });
	await rangee.locator('input[type=file]').first().setInputFiles(pdf('egare.pdf', 'egare'));
	await expect(rangee).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: 'Pièce jointe.' })).toBeVisible();

	const frais = page.getByRole('row', { name: /Frais de tenue/ });
	await frais.getByRole('button', { name: 'Actions de Frais de tenue' }).click();
	await page.getByRole('button', { name: 'Pas besoin de Pièce' }).click();
	await expect(frais).toHaveCount(0);
	// Annuler la remet dans la liste.
	await page.getByRole('button', { name: 'Annuler' }).last().click();
	await expect(frais).toBeVisible();

	await page.setViewportSize({ width: 320, height: 640 });
	await expect(frais).toBeVisible();
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
});

test('4.2 : le panneau propose la même case, pour une dépense seulement', async ({ page }) => {
	await page.goto('/operations?op=nouvelle', { waitUntil: 'networkidle' });
	await expect(panneau(page).getByLabel('Pas besoin de Pièce')).toBeVisible();
	await panneau(page).getByRole('button', { name: 'Recette', exact: true }).click();
	await expect(panneau(page).getByLabel('Pas besoin de Pièce')).toHaveCount(0);
});

test('4.2 : Toutes montre la grille, et une Pièce sans Opération attend', async ({ page }) => {
	await page.goto('/pieces/photo', { waitUntil: 'networkidle' });
	await page
		.locator('input[type=file]:not([capture])')
		.last()
		.setInputFiles(pdf('attente.pdf', 'a'));
	await expect(page.getByText('La photo est enregistrée.')).toBeVisible();
	await page.getByRole('button', { name: 'Rattacher plus tard' }).click();

	await page.goto('/pieces/toutes', { waitUntil: 'networkidle' });
	await expect(page.getByRole('link', { name: 'Ouvrir attente.pdf' })).toBeVisible();
	await expect(page.getByText('À rattacher').first()).toBeVisible();
	await axeSansViolation(page);

	await page.getByLabel('Rechercher').fill('attente');
	await expect(page).toHaveURL(/q=attente/);
	await expect(page.locator('p[role=status]')).toHaveText('1 Pièce');
	await page.getByLabel('État').selectOption('rattachee');
	await expect(page.getByText('Rien ne correspond')).toBeVisible();
	await page.getByRole('button', { name: 'Tout effacer' }).click();
	await expect(page.getByRole('link', { name: 'Ouvrir attente.pdf' })).toBeVisible();

	// Elle se rattache depuis son panneau.
	await page.getByRole('link', { name: 'Ouvrir attente.pdf' }).click();
	const champ = panneau(page).getByRole('combobox', { name: 'Rattacher à une Opération' });
	await champ.click();
	await champ.fill('Copie deux');
	await panneau(page)
		.getByRole('option', { name: /Copie deux/ })
		.first()
		.click();
	await panneau(page).getByRole('button', { name: 'Rattacher', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Opérations justifiées' })).toContainText(
		'Copie deux'
	);
	await axeSansViolation(page);

	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/pieces/toutes', { waitUntil: 'networkidle' });
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await axeSansViolation(page);
});

test('F7 : une Pièce en attente se supprime, une Pièce rattachée non', async ({ page }) => {
	await page.goto('/pieces/photo', { waitUntil: 'networkidle' });
	await page.locator('input[type=file]:not([capture])').last().setInputFiles(pdf('jetee.pdf', 'j'));
	await expect(page.getByText('La photo est enregistrée.')).toBeVisible();
	await page.getByRole('button', { name: 'Rattacher plus tard' }).click();
	await page.goto(`/pieces/toutes?piece=${piece('jetee.pdf')?.id}`, { waitUntil: 'networkidle' });
	await panneau(page).getByRole('button', { name: 'Supprimer cette Pièce' }).click();
	await page
		.getByRole('dialog', { name: 'Supprimer cette Pièce ?' })
		.getByRole('button', { name: 'Supprimer' })
		.click();
	await expect(page.getByRole('link', { name: 'Ouvrir jetee.pdf' })).toHaveCount(0);
	expect(piece('jetee.pdf')).toBeUndefined();

	await page.goto(`/pieces/toutes?piece=${piece('commune.pdf')?.id}`, {
		waitUntil: 'networkidle'
	});
	await expect(panneau(page).getByRole('button', { name: 'Supprimer cette Pièce' })).toHaveCount(0);
});

test.describe('4.3 : photo sur téléphone', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
	});

	test('Photo ouvre l’appareil, réduit l’image et retire EXIF et GPS', async ({
		page,
		browserName
	}) => {
		await nouvelleDepense(page, { libelle: 'Pain du goûter', montant: '6', date: '2028-08-01' });
		await page.goto('/', { waitUntil: 'networkidle' });
		const photo = await photoAvecExif(page);
		expect(photo.buffer.includes('Exif')).toBe(true);

		const choix = page.waitForEvent('filechooser');
		await page
			.getByRole('navigation', { name: 'Navigation mobile' })
			.getByRole('link', { name: 'Photo' })
			.click();
		const selecteur = await choix;
		expect(selecteur.isMultiple()).toBe(false);
		await selecteur.setFiles(photo);
		await expect(page).toHaveURL(/\/pieces\/photo/);
		await expect(page.getByText('La photo est enregistrée.')).toBeVisible();

		const stockee = pieceDeJpeg();
		expect(stockee.mime).toBe('image/jpeg');
		const r = await page.request.get(`/fichiers/${stockee.sha256}`);
		const octets = await r.body();
		// Safari écrit son propre Exif, espace couleur et dimensions, même sur une toile vierge.
		if (browserName !== 'webkit') expect(octets.includes('Exif')).toBe(false);
		expect(octets.includes('GPSLatitude')).toBe(false);
		const largeur = await page.evaluate(async (sha) => {
			const b = await (await fetch(`/fichiers/${sha}`)).blob();
			return (await createImageBitmap(b)).width;
		}, stockee.sha256);
		expect(largeur).toBe(2000);

		// Dépenses récentes d'abord, cibles au pouce.
		const liste = page.getByRole('list', { name: 'Dépenses récentes sans Pièce' });
		await expect(liste.getByRole('button').first()).toContainText('Pain du goûter');
		for (const cible of await page.locator('main button:visible').all()) {
			expect((await cible.boundingBox())?.height).toBeGreaterThanOrEqual(48);
		}
		expect(await sansDefilementHorizontal(page)).toBe(true);
		await axeSansViolation(page);

		await liste.getByRole('button', { name: /Pain du goûter/ }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Rangée avec' })).toBeVisible();
		const b = base();
		const lien = b
			.prepare('SELECT count(*) FROM piece_operation WHERE piece_id = ? AND operation_id = ?')
			.pluck()
			.get(stockee.id, operationId('Pain du goûter'));
		b.close();
		expect(lien).toBe(1);
	});

	test('une image illisible part en l’état, un format refusé le dit', async ({ page }) => {
		await page.goto('/pieces/photo', { waitUntil: 'networkidle' });
		await expect(page.getByRole('button', { name: 'Prendre une photo' })).toBeVisible();
		await axeSansViolation(page);

		// Le navigateur ne décode pas ce JPEG tronqué : il part tel quel, et le serveur l'accepte.
		await page
			.locator('input[type=file][capture]')
			.last()
			.setInputFiles({
				name: 'tronquee.jpg',
				mimeType: 'image/jpeg',
				buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 1, 2, 3])
			});
		await expect(page.getByText('La photo est enregistrée.')).toBeVisible();
		expect(piece('tronquee.jpg')?.mime).toBe('image/jpeg');
		await page.getByRole('button', { name: 'Rattacher plus tard' }).click();

		await page
			.locator('input[type=file][capture]')
			.last()
			.setInputFiles({
				name: 'photo.heic',
				mimeType: 'image/heic',
				buffer: Buffer.from('ftypheic pas décodable')
			});
		await expect(page.getByRole('alert')).toContainText('n’est ni un PDF, ni une image');
		expect(piece('photo.heic')).toBeUndefined();
	});
});
