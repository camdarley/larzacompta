import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { LIGNES_FICTIVES, ofxCp1252, ofxTexte, type LigneOfx } from '../jeux/releve-fictif.ts';
import { DOSSIER_E2E, ORIGINE_E2E } from './config.ts';
import { axeSansViolation, base, connecter, sansDefilementHorizontal } from './aides.ts';
import { panneau } from './aides-operations.ts';

test.describe.configure({ mode: 'serial' });

const COMPTE = 'Banque imaginaire';
// Le jeu fictif, ramené dans le seul Exercice ouvert de cette campagne.
const LIGNES = LIGNES_FICTIVES.map((l) => ({ ...l, date: l.date.replace('2026', '2027') }));
const SOLDE = { montant: '471.50', date: '20271021' };
let compte: number;

// Les parcours précédents laissent 2027-2028 ouvert : ce Compte y démarre, sans aucun mouvement.
test.beforeAll(() => {
	const b = base();
	compte = Number(
		b.prepare(`INSERT INTO compte (libelle, type, ordre) VALUES (?, 'banque', 50)`).run(COMPTE)
			.lastInsertRowid
	);
	const exercice = b.prepare("SELECT id FROM exercice WHERE statut = 'ouvert'").pluck().get();
	b.prepare(
		'INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, 100000)'
	).run(compte, exercice);
	b.close();
});

test.beforeEach(async ({ page }) => {
	await connecter(page);
	await page.setViewportSize({ width: 1280, height: 900 });
});

const ofx = (
	lignes: LigneOfx[],
	solde: { montant: string; date: string } | null,
	nom = 'r.ofx'
) => ({
	name: nom,
	mimeType: 'application/octet-stream',
	buffer: Buffer.from(ofxCp1252(ofxTexte(lignes, solde)))
});
const csv = (lignes: string[], nom = 'r.csv') => ({
	name: nom,
	mimeType: 'text/csv',
	buffer: Buffer.from(lignes.join('\n'))
});

/** Le champ n'écoute qu'une fois la page hydratée. */
async function choisirFichier(page: Page, f: Parameters<Page['setInputFiles']>[1]) {
	await page.waitForLoadState('networkidle');
	await page.locator('input[type=file]').first().setInputFiles(f);
}
const ligne = (page: Page, libelle: string) =>
	page.getByRole('button', { name: new RegExp(`^${libelle}`) });
const barre = (page: Page) => page.getByRole('region', { name: 'Écart du relevé' });
const volet = (page: Page) => page.getByRole('region', { name: 'Ligne active' });

/** La page est prête quand la file a le focus. */
async function ouvrir(page: Page, id = compte) {
	await page.goto(`/pointage/${id}`);
	await expect(page.locator('[data-ligne]:focus')).toHaveCount(1);
}

test('3.3 : /pointage sans relevé propose le dépôt et la saisie', async ({ page }) => {
	await page.goto(`/pointage/${compte}`);
	await expect(page).toHaveTitle(new RegExp(`^Pointage, ${COMPTE},`));
	await expect(page.getByRole('heading', { name: 'Aucun relevé pour ce Compte' })).toBeVisible();
	await expect(
		page.getByText('Déposez ici le fichier OFX ou CSV téléchargé depuis votre banque.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choisir un fichier' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Saisir une ligne' })).toBeVisible();
	await axeSansViolation(page);

	// Seuls les Comptes banque et épargne sont sélectionnables.
	await page.getByRole('button', { name: new RegExp(`${COMPTE}, changer de Compte`) }).click();
	await expect(page.getByRole('link', { name: 'Livret', exact: true })).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: /Caisse/ })).toHaveCount(0);
});

test('3.3 : /pointage mène au premier Compte, une caisse n’a pas de Pointage', async ({ page }) => {
	await page.goto('/pointage');
	await expect(page).toHaveURL(/\/pointage\/\d+/);
	const b = base();
	const caisse = b.prepare("SELECT id FROM compte WHERE type = 'caisse'").pluck().get();
	b.close();
	if (caisse) {
		const r = await page.goto(`/pointage/${caisse}`);
		expect(r?.status()).toBe(404);
	}
});

function compteVierge(libelle: string, solde: number) {
	const b = base();
	const id = Number(
		b.prepare(`INSERT INTO compte (libelle, type, ordre) VALUES (?, 'banque', 70)`).run(libelle)
			.lastInsertRowid
	);
	const exercice = b.prepare("SELECT id FROM exercice WHERE statut = 'ouvert'").pluck().get();
	b.prepare(
		'INSERT INTO balance_ouverture (compte_id, exercice_id, solde_centimes) VALUES (?, ?, ?)'
	).run(id, exercice, solde);
	b.close();
	return id;
}

/** Opération posée par l'API : ce parcours porte sur le Pointage, pas sur le panneau. */
async function operation(
	page: Page,
	o: {
		compteId: number;
		libelle: string;
		montant: number;
		date: string;
		reference?: string;
		intention?: 'depense' | 'recette';
	}
) {
	const b = base();
	const nature = b.prepare("SELECT id FROM nature WHERE libelle = 'Papeterie'").pluck().get();
	b.close();
	const r = await page.request.post('/api/operations', {
		headers: { origin: ORIGINE_E2E },
		data: {
			forme: 'standard',
			libelle: o.libelle,
			reference: o.reference ?? null,
			intention: o.intention ?? 'depense',
			compteId: o.compteId,
			date: o.date,
			montant: o.montant,
			lignes: [{ montant: o.montant, natureId: nature }]
		}
	});
	expect(r.ok()).toBe(true);
	return ((await r.json()) as { id: number }).id;
}

test('3.3 : déposer un OFX affiche le récapitulatif sans changer de page', async ({ page }) => {
	await page.goto(`/pointage/${compte}`);
	const url = page.url();
	await choisirFichier(page, ofx(LIGNES, SOLDE));
	await expect(page.getByText('3 lignes lues, 3 nouvelles, 0 déjà connue.')).toBeVisible();
	expect(page.url().split('?')[0]).toBe(url);
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeVisible();
	await expect(page.getByText('REMISE CHÈQUES ÉCOLE FICTIVE').first()).toBeVisible();

	// Le fichier d'origine est conservé, adressé par son SHA-256.
	const b = base();
	const sha = b
		.prepare('SELECT fichier_sha256 FROM import_releve WHERE compte_id = ?')
		.pluck()
		.get(compte) as string;
	b.close();
	expect(existsSync(join(DOSSIER_E2E, 'fichiers', sha.slice(0, 2), sha))).toBe(true);

	await expect(
		page
			.getByRole('link', { name: /Pointage/ })
			.locator('.compteur, span')
			.filter({ hasText: '3' })
	).toBeVisible();
	await axeSansViolation(page);
});

test('3.2 : le même fichier deux fois : rien n’est ajouté, et le message le dit', async ({
	page
}) => {
	await page.goto(`/pointage/${compte}`);
	await choisirFichier(page, ofx(LIGNES, SOLDE));
	await expect(
		page.getByText('Toutes les lignes de ce fichier sont déjà connues. Rien n’a été ajouté.')
	).toBeVisible();
});

test('3.1 : un fichier illisible est refusé en entier, avec la raison', async ({ page }) => {
	await page.goto(`/pointage/${compte}`);
	await choisirFichier(page, {
		name: 'tronque.ofx',
		mimeType: 'text/plain',
		buffer: Buffer.from('OFXHEADER:100\n<OFX><STMTTRN><TRNAMT>12')
	});
	await expect(page.getByRole('alert')).toContainText('Ce fichier n’a pas pu être lu');
	await expect(page.getByRole('alert')).toContainText('Rien n’a été importé.');
});

test('3.3 : deux lignes identiques : À regarder, confirmées ou écartées une à une', async ({
	page
}) => {
	await page.goto(`/pointage/${compte}`);
	await choisirFichier(
		page,
		ofx(
			[
				{ date: '20271021', montant: '-5.00', id: 'D1', libelle: 'CB BOULANGERIE IMAGINAIRE' },
				{ date: '20271021', montant: '-5.00', id: 'D2', libelle: 'CB BOULANGERIE IMAGINAIRE' }
			],
			null
		)
	);
	// Le fichier n'a pas de solde : il se demande. Plus tard, ici.
	await expect(
		page.getByRole('dialog').getByRole('heading', { name: 'Solde du relevé' })
	).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Plus tard' }).click();

	await expect(
		page.getByText('Ces deux lignes sont identiques : même date, même montant, même libellé.')
	).toBeVisible();
	const doublons = page.locator('[data-ligne]').filter({ hasText: 'BOULANGERIE' });
	await expect(doublons).toHaveCount(2);
	await expect(doublons.first()).toContainText('À regarder');
	await axeSansViolation(page);

	// P4 : elle ne se pointe pas.
	await doublons.first().click();
	await expect(volet(page).getByRole('button', { name: /Pointer/ })).toHaveCount(0);
	await expect(volet(page)).toContainText(
		'Confirmez ou écartez d’abord cette Ligne de relevé, identique à une autre.'
	);

	await volet(page).getByRole('button', { name: 'Garder cette ligne' }).click();
	await expect(page.getByText('Ligne gardée.')).toBeVisible();
	await page.locator('[data-ligne]', { hasText: 'À regarder' }).click();
	await volet(page).getByRole('button', { name: 'Écarter cette ligne' }).click();
	await expect(page.getByText('Ligne écartée.')).toBeVisible();
	await expect(doublons).toHaveCount(1);
	await expect(doublons.first()).toContainText('À pointer');
	await expect(page.getByText('Ces deux lignes sont identiques')).toHaveCount(0);
});

test('3.3 : un trou de dates avec l’import précédent se signale', async ({ page }) => {
	const trou = compteVierge('Banque trouée', 0);
	await page.goto(`/pointage/${trou}`);
	await choisirFichier(page, [
		ofx([{ date: '20280303', montant: '1.00', id: 'T1', libelle: 'INTERETS' }], null, 'a.ofx'),
		ofx([{ date: '20280328', montant: '2.00', id: 'T2', libelle: 'INTERETS' }], null, 'b.ofx')
	]);
	await page.getByRole('dialog').getByRole('button', { name: 'Plus tard' }).click();
	await expect(
		page.getByText('Aucune ligne entre le 3 et le 28 mars. Il manque peut-être un relevé.')
	).toBeVisible();
	await expect(page.getByText('a.ofx :')).toBeVisible();
	await expect(page.getByText('b.ofx :')).toBeVisible();
	await axeSansViolation(page);
});

test('3.3 : saisir une ligne quand aucun export n’existe', async ({ page }) => {
	await page.goto(`/pointage/${compte}`);
	await page.getByRole('button', { name: 'Saisir une ligne' }).click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Date').fill('2027-10-22');
	await d.getByLabel('Libellé').fill('Virement noté à la main');
	await d.getByRole('button', { name: 'Entrée', exact: true }).click();
	await d.getByLabel('Montant').fill('12,34');
	await axeSansViolation(page);
	await d.getByRole('button', { name: 'Ajouter la ligne' }).click();
	await expect(page.getByText('Ligne ajoutée.')).toBeVisible();
	await expect(ligne(page, 'Virement noté à la main')).toBeVisible();
	const b = base();
	const brut = b
		.prepare(
			`SELECT import_id, montant_centimes FROM ligne_releve WHERE libelle LIKE 'Virement noté%'`
		)
		.get();
	b.close();
	expect(brut).toEqual({ import_id: null, montant_centimes: 1234 });

	// Une ligne saisie à la main se retire, tant qu'elle n'est pas pointée.
	await ligne(page, 'Virement noté à la main').click();
	await volet(page).getByRole('button', { name: 'Supprimer cette ligne saisie' }).click();
	await expect(ligne(page, 'Virement noté à la main')).toHaveCount(0);
});

test('3.3 : un fichier se dépose aussi par glisser-déposer ou par collage', async ({ page }) => {
	const id = compteVierge('Banque à déposer', 0);
	await page.goto(`/pointage/${id}`);
	await page.waitForLoadState('networkidle');

	async function evenement(type: 'drop' | 'paste', identifiant: string) {
		await page.evaluate(
			([genre, texte]) => {
				const f = new File(
					[
						[
							'OFXHEADER:100',
							'',
							'<OFX><BANKTRANLIST>',
							`<STMTTRN><DTPOSTED>20271020<TRNAMT>-1.00<FITID>${texte}<NAME>LIGNE ${texte}</STMTTRN>`,
							'</BANKTRANLIST></OFX>'
						].join('\n')
					],
					`${texte}.ofx`
				);
				const donnees = new DataTransfer();
				donnees.items.add(f);
				const e =
					genre === 'drop'
						? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: donnees })
						: new ClipboardEvent('paste', {
								bubbles: true,
								cancelable: true,
								clipboardData: donnees
							});
				document.querySelector('main')?.dispatchEvent(e);
			},
			[type, identifiant]
		);
	}

	await evenement('drop', 'D1');
	await expect(
		page.getByRole('dialog').getByRole('heading', { name: 'Solde du relevé' })
	).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Plus tard' }).click();
	await expect(ligne(page, 'LIGNE D1')).toBeVisible();

	await evenement('paste', 'P1');
	await expect(
		page.getByRole('dialog').getByRole('heading', { name: 'Solde du relevé' })
	).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Plus tard' }).click();
	await expect(ligne(page, 'LIGNE P1')).toBeVisible();
});

test('3.4 : un premier CSV passe par la correspondance, le suivant s’importe seul', async ({
	page
}) => {
	await page.goto(`/pointage/${compteVierge('Banque CSV', 0)}`);
	await choisirFichier(
		page,
		csv([
			'Compte fictif;00000',
			'',
			'Date;Libellé;Sorties;Entrées',
			'12/10/2027;Intérêts imaginaires;;1 234,56',
			'13/10/2027;Frais imaginaires;3,50;'
		])
	);
	const d = page.getByRole('dialog');
	await expect(d.getByRole('heading', { name: 'Colonnes de votre fichier' })).toBeVisible();
	await expect(
		d.getByRole('button', { name: 'Deux colonnes, Sorties et Entrées' })
	).toHaveAttribute('aria-pressed', 'true');
	await expect(d.getByText('Intérêts imaginaires')).toBeVisible();
	await expect(d.getByText('1 234,56')).toBeVisible();
	await expect(d).not.toContainText(/débit|crédit/i);
	await axeSansViolation(page);

	await d.getByRole('button', { name: 'Importer ces lignes' }).click();
	await expect(page.getByText('2 lignes lues, 2 nouvelles, 0 déjà connue.')).toBeVisible();
	// Un CSV n'a pas de solde : il se demande, un Constat de source saisie se crée (3.5).
	const solde = page.getByRole('dialog');
	await expect(solde.getByRole('heading', { name: 'Solde du relevé' })).toBeVisible();
	await expect(solde.getByLabel('À la date du')).toHaveValue('2027-10-13');
	await solde.getByLabel('Solde du relevé').fill('1231,06');
	await solde.getByRole('button', { name: 'Enregistrer le solde' }).click();
	await expect(page.getByText('Solde enregistré.')).toBeVisible();
	await expect(barre(page)).toContainText('1 231,06');

	// Le réglage s'applique sans demander.
	await choisirFichier(
		page,
		csv(['Date;Libellé;Sorties;Entrées', '14/10/2027;Encore imaginaire;;10,00'], 's.csv')
	);
	await expect(page.getByText('1 ligne lue, 1 nouvelle, 0 déjà connue.')).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Plus tard' }).click();

	// Une colonne disparue : rien n'est importé, et la correspondance se rouvre.
	await choisirFichier(page, csv(['Date;Libellé;Valeur', '15/10/2027;Disparue;10,00'], 't.csv'));
	const reouvert = page.getByRole('dialog');
	await expect(reouvert.getByRole('alert')).toContainText(
		'La colonne Sorties est introuvable dans ce fichier.'
	);
	await expect(reouvert.getByRole('heading', { name: 'Colonnes de votre fichier' })).toBeVisible();
	await reouvert.getByRole('button', { name: 'Laisser ce fichier' }).click();
	await expect(ligne(page, 'Disparue')).toHaveCount(0);
});

test('3.5 : barre-ecart, causes de l’Écart, annonce polie', async ({ page }) => {
	await page.goto(`/pointage/${compte}`);
	const b = barre(page);
	await expect(b).toContainText('Relevé');
	await expect(b).toContainText('471,50');
	await expect(b).toContainText('Calculé');
	await expect(b).toContainText('1 000,00');
	await expect(b).toContainText('528,50');
	await expect(b).toContainText('0 sur 4');
	await expect(b.locator('[aria-live="polite"]')).toContainText('0 sur 4');
	await b.getByRole('button', { name: /Écart de 528,50/ }).click();
	await expect(page).toHaveURL(/causes=1/);
	const d = page.getByRole('dialog');
	await expect(d.getByRole('heading', { name: 'Causes de l’Écart' })).toBeVisible();
	await expect(d.getByRole('heading', { name: 'Lignes de relevé non pointées' })).toBeVisible();
	await expect(d).toContainText('VIR SEPA AUTOCARS IMAGINAIRES FA-2026-14');
	await axeSansViolation(page);
	await page.keyboard.press('Escape');
	await expect(d).toHaveCount(0);
});

test('3.6 : une proposition dit pourquoi, présélectionnée, jamais pointée', async ({ page }) => {
	await operation(page, {
		compteId: compte,
		libelle: 'Autocars imaginaires',
		montant: 100000,
		date: '2027-10-04',
		reference: 'FA-2026-14'
	});
	await ouvrir(page);
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeFocused();
	const p = volet(page).locator('.proposition');
	await expect(p).toHaveCount(1);
	await expect(p).toContainText('Autocars imaginaires');
	await expect(p).toContainText('Même montant, n° de facture lu dans le libellé');
	await expect(p.getByRole('button', { pressed: true })).toBeVisible();
	await expect(barre(page)).toContainText('0 sur 4');
	await axeSansViolation(page);
	await expect(page.getByText('Tout valider')).toHaveCount(0);
});

test('3.7 : Entrée pointe, Ctrl+Z annule, le Journal garde son contenu', async ({ page }) => {
	await ouvrir(page);
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Pointé.')).toBeVisible();
	await expect(barre(page)).toContainText('1 sur 4');
	await expect(ligne(page, 'FRAIS TENUE')).toBeFocused();
	await expect(page.locator('[data-ligne]').last()).toContainText('Pointé');

	await page.keyboard.press('Control+z');
	await expect(page.getByText('Pointage annulé.')).toBeVisible();
	await expect(barre(page)).toContainText('0 sur 4');
	const b = base();
	const annule = b
		.prepare(`SELECT avant_json FROM journal_modification WHERE evenement = 'pointage.annule'`)
		.pluck()
		.get() as string;
	b.close();
	expect(JSON.parse(annule).coteIds).toHaveLength(1);

	// Le toast annule aussi.
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeFocused();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
	await expect(barre(page)).toContainText('0 sur 4');
});

test('3.7 : la file a un seul élément actif, ↓ ↑ j k la parcourent, p reporte', async ({
	page
}) => {
	await ouvrir(page);
	const courant = page.locator('[data-ligne][tabindex="0"]');
	await expect(courant).toHaveCount(1);
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(ligne(page, 'FRAIS TENUE')).toBeFocused();
	await page.keyboard.press('j');
	await expect(ligne(page, 'REMISE CHÈQUES')).toBeFocused();
	await page.keyboard.press('k');
	await page.keyboard.press('ArrowUp');
	await expect(ligne(page, 'VIR SEPA AUTOCARS')).toBeFocused();
	await expect(page).toHaveURL(/ligne=\d+/);

	await page.keyboard.press('p');
	await expect(ligne(page, 'FRAIS TENUE')).toBeFocused();
	const lignes = page.locator('[data-ligne]');
	await expect(lignes.nth(0)).toContainText('FRAIS TENUE');
	await expect(lignes.nth(3)).toContainText('VIR SEPA AUTOCARS');
	await expect(lignes.nth(3)).toContainText('À pointer');

	// Pendant une saisie, une lettre reste une lettre.
	await page.keyboard.press('r');
	const champ = volet(page).getByRole('combobox', { name: 'Opération à relier' });
	await expect(champ).toBeFocused();
	await page.keyboard.type('p');
	await expect(champ).toHaveValue('p');
	await expect(lignes.nth(0)).toContainText('FRAIS TENUE');
});

test('3.7 : hors de la file, les lettres n’agissent pas, et ? montre les raccourcis', async ({
	page
}) => {
	await ouvrir(page);
	const active = page.locator('[data-ligne][tabindex="0"]');
	const avant = await active.textContent();
	await page.getByRole('heading', { name: 'Pointage', level: 1 }).focus();
	await page.keyboard.press('j');
	await page.keyboard.press('p');
	await expect(active).toHaveText(avant ?? '');

	await page.keyboard.press('?');
	const d = page.getByRole('dialog');
	await expect(d).toContainText('Passe cette ligne, sans la pointer');
	await expect(d).toContainText('Annule le dernier Pointage');
	await page.keyboard.press('Escape');
});

test('3.7 : Opération pointée : Mouvement bancaire et Annuler le Pointage', async ({ page }) => {
	await ouvrir(page);
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('1 sur 4');

	const b = base();
	const id = b
		.prepare(`SELECT id FROM operation WHERE libelle = 'Autocars imaginaires'`)
		.pluck()
		.get();
	b.close();
	await page.goto(`/operations?op=${id}`);
	const d = panneau(page);
	await expect(d.getByRole('region', { name: 'Mouvement bancaire' })).toContainText(
		'VIR SEPA AUTOCARS'
	);
	await expect(d).toContainText('son montant et son Compte sont verrouillés');
	await d.getByRole('button', { name: 'Annuler le Pointage' }).click();
	await expect(page.getByText('Pointage annulé.')).toBeVisible();
	await expect(d.getByRole('region', { name: 'Mouvement bancaire' })).toHaveCount(0);
});

test('3.9 : c reprend la ligne, Ctrl+Entrée enregistre et pointe, puis la suite', async ({
	page
}) => {
	await ouvrir(page);
	await ligne(page, 'FRAIS TENUE').click();
	await page.keyboard.press('c');
	const d = panneau(page);
	await expect(d.getByRole('heading', { name: 'Nouvelle Opération' })).toBeVisible();
	await expect(d.getByLabel('Montant', { exact: true })).toHaveValue(/^3,50$/);
	await expect(d.getByLabel('Date')).toHaveValue('2027-10-08');
	await expect(d.getByLabel('Libellé')).toHaveValue('FRAIS TENUE DE COMPTE');
	await expect(d.getByRole('button', { name: 'Dépense' })).toHaveAttribute('aria-pressed', 'true');
	await expect(d.getByRole('combobox', { name: 'Nature de la ligne 1' })).toBeVisible();
	await axeSansViolation(page);

	// Un échec n'écrit rien : la ligne reste à pointer, le panneau reste ouvert.
	await d.getByLabel('Montant', { exact: true }).fill('4');
	await d.getByLabel('Montant de la ligne 1').fill('4');
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.fill('Papeterie');
	await nature.press('Enter');
	await page.keyboard.press('Control+Enter');
	await expect(d.getByRole('alert')).toContainText('Il reste 0,50 € d’écart');
	await expect(d).toBeVisible();

	await d.getByLabel('Montant', { exact: true }).fill('3,50');
	await d.getByLabel('Montant de la ligne 1').fill('3,50');
	await d.getByLabel('Montant de la ligne 1').press('Control+Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(barre(page)).toContainText('1 sur 4');
	await expect(ligne(page, 'REMISE CHÈQUES')).toBeFocused();
	await expect(page.getByText('Pointé.')).toBeVisible();
	await expect(barre(page)).toContainText('− 3,50');
});

test('3.8 : r relie, Espace coche, et une différence s’ajuste', async ({ page }) => {
	await operation(page, {
		compteId: compte,
		libelle: 'Vente de gâteaux',
		montant: 30000,
		date: '2027-10-11',
		intention: 'recette'
	});
	await operation(page, {
		compteId: compte,
		libelle: 'Tombola',
		montant: 17999,
		date: '2027-10-11',
		intention: 'recette'
	});
	await ouvrir(page);
	await ligne(page, 'REMISE CHÈQUES').click();

	await page.keyboard.press('r');
	const champ = volet(page).getByRole('combobox', { name: 'Opération à relier' });
	await expect(champ).toBeFocused();
	await page.keyboard.type('gâteaux');
	await expect(volet(page).getByRole('option')).toHaveCount(1);
	await expect(volet(page).getByRole('option', { name: /Vente de gâteaux/ })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(volet(page)).toContainText('Vente de gâteaux');

	await page.keyboard.press('r');
	await expect(champ).toBeFocused();
	await page.keyboard.type('tombola');
	await expect(volet(page).getByRole('option')).toHaveCount(1);
	await expect(volet(page).getByRole('option', { name: /Tombola/ })).toBeVisible();
	await page.keyboard.press('Enter');

	const pose = volet(page).locator('.pose');
	await expect(pose).toContainText('Ligne de relevé');
	await expect(pose).toContainText('Relié');
	await expect(pose).toContainText('Différence');
	await expect(pose).toContainText('0,01');

	await expect(volet(page)).toContainText(
		'Il reste 0,01 € d’écart entre le relevé et l’Opération. Corrigez l’Opération, ou créez un ajustement de 0,01 €.'
	);
	await axeSansViolation(page);
	await volet(page)
		.getByRole('button', { name: /Créer un ajustement de 0,01/ })
		.click();
	await expect(page.getByText('Pointé.')).toBeVisible();
	await expect(barre(page)).toContainText('2 sur 4');
	const b = base();
	const ajustement = b
		.prepare(`SELECT origine FROM operation WHERE libelle = 'Ajustement de Pointage'`)
		.pluck()
		.get();
	b.close();
	expect(ajustement).toBe('ajustement');
});

test('3.7 : dernière ligne sans Écart nul : le lien vers les causes', async ({ page }) => {
	await ouvrir(page);
	await ligne(page, 'VIR SEPA AUTOCARS').click();
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('3 sur 4');
	await ligne(page, 'CB BOULANGERIE').click();
	await page.keyboard.press('c');
	const d = panneau(page);
	const nature = d.getByRole('combobox', { name: 'Nature de la ligne 1' });
	await nature.fill('Papeterie');
	await nature.press('Enter');
	await nature.press('Control+Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(barre(page)).toContainText('4 sur 4');

	// Le solde posé plus haut vaut 471,50 : tout est juste, au centime.
	await expect(volet(page).getByRole('heading', { name: 'Tout est pointé' })).toBeVisible();
	await expect(volet(page)).toContainText(
		'Le solde calculé égale le relevé du 21 octobre, au centime.'
	);
	await expect(volet(page).getByRole('img')).toBeVisible();
	await expect(barre(page).getByRole('button', { name: /Écart de 0,00/ })).toBeVisible();
	await axeSansViolation(page);

	// Un nouveau solde crée un Écart : la phrase change, et mène aux causes.
	await barre(page).getByRole('heading', { name: 'Pointage' }).waitFor();
	const b = base();
	b.prepare(
		`INSERT INTO constat_solde (compte_id, date, solde_centimes, source, cree_le, cree_par)
		 VALUES (?, '2027-10-22', 48400, 'saisie', '2027-10-22T10:00:00.000Z', 1)`
	).run(compte);
	b.close();
	await page.reload();
	await expect(volet(page)).toContainText(
		'Toutes les lignes sont traitées, mais il reste un Écart de 12,50 €.'
	);
	await volet(page).getByRole('button', { name: 'Voir les causes' }).click();
	await expect(
		page.getByRole('dialog').getByRole('heading', { name: 'Causes de l’Écart' })
	).toBeVisible();
});

test('3.10 : plusieurs relevés qui se chevauchent, contrôle dès le premier fichier', async ({
	page
}) => {
	const id = compteVierge('Banque de reprise', 50000);
	const l = (n: number): LigneOfx => ({
		date: `202710${String(n).padStart(2, '0')}`,
		montant: `-${n}.00`,
		id: `R${n}`,
		libelle: `CB FICTIVE ${n}`
	});
	await page.goto(`/pointage/${id}`);
	await choisirFichier(
		page,
		ofx([l(1), l(2), l(3)], { montant: '494.00', date: '20271003' }, 'a.ofx')
	);
	await expect(page.getByText('3 lignes lues, 3 nouvelles, 0 déjà connue.')).toBeVisible();
	await expect(barre(page)).toContainText('494,00');
	await expect(barre(page).getByRole('button', { name: /Écart de 6,00/ })).toBeVisible();
	await choisirFichier(page, [
		ofx([l(2), l(3), l(4)], { montant: '490.00', date: '20271004' }, 'b.ofx'),
		ofx([l(3), l(4), l(5)], { montant: '485.00', date: '20271005' }, 'c.ofx')
	]);
	await expect(page.getByText('c.ofx :')).toBeVisible();
	await expect(page.locator('[data-ligne]')).toHaveCount(5);
	await expect(barre(page)).toContainText('485,00');
	await expect(barre(page).getByRole('button', { name: /Écart de 15,00/ })).toBeVisible();
});

test('3.10 : 15 lignes pointées, créées, reliées et ajustées, sans toucher la souris', async ({
	page
}) => {
	const id = compteVierge('Banque du parcours', 200000);
	const j = (n: number) => `202711${String(n).padStart(2, '0')}`;
	const date = (n: number) => `2027-11-${String(n).padStart(2, '0')}`;
	const simples = [11, 12, 13, 14, 15, 16, 17, 18];
	for (const n of simples) {
		await operation(page, {
			compteId: id,
			libelle: `Dépense ${n}`,
			montant: n * 100 + 7,
			date: date(n)
		});
	}
	await operation(page, {
		compteId: id,
		libelle: 'Fournisseur partie A',
		montant: 3000,
		date: date(19)
	});
	await operation(page, {
		compteId: id,
		libelle: 'Fournisseur partie B',
		montant: 2000,
		date: date(19)
	});
	await operation(page, { compteId: id, libelle: 'Presque juste', montant: 4999, date: date(20) });
	await operation(page, { compteId: id, libelle: 'À passer', montant: 6000, date: date(22) });

	const lignes: LigneOfx[] = [
		...simples.map((n) => ({
			date: j(n),
			montant: `-${n}.07`,
			id: `P${n}`,
			libelle: `CB SANS RAPPORT ${n}`
		})),
		{ date: j(19), montant: '-50.00', id: 'P19', libelle: 'VIR GROUPE' },
		{ date: j(20), montant: '-50.00', id: 'P20', libelle: 'PRESTATION' },
		{ date: j(21), montant: '-7.00', id: 'P21', libelle: 'FRAIS BANCAIRES' },
		{ date: j(22), montant: '-60.00', id: 'P22', libelle: 'CARTE LIBRE' },
		{ date: j(23), montant: '12.00', id: 'P23', libelle: 'INTERETS' },
		{ date: j(24), montant: '-1.50', id: 'P24', libelle: 'COMMISSION' },
		{ date: j(25), montant: '-2.50', id: 'P25', libelle: 'TIMBRES' }
	];
	const total = 200000 + lignes.reduce((s, l) => s + Math.round(Number(l.montant) * 100), 0);
	const solde = `${Math.floor(total / 100)}.${String(total % 100).padStart(2, '0')}`;

	await page.goto(`/pointage/${id}`);
	await choisirFichier(page, ofx(lignes, { montant: solde, date: j(25) }));
	await expect(barre(page)).toContainText('0 sur 15');
	await axeSansViolation(page);
	await page.setViewportSize({ width: 320, height: 800 });
	await axeSansViolation(page);
	expect(await sansDefilementHorizontal(page)).toBe(true);
	await expect(page.getByText('Cet écran se travaille sur ordinateur.')).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.reload();

	// Huit lignes de montant unique : Entrée, Entrée, Entrée.
	for (let i = 0; i < simples.length; i += 1) {
		await expect(page.locator('[data-ligne]:focus')).toContainText(`${simples[i]}`);
		await page.keyboard.press('Enter');
		await expect(barre(page)).toContainText(`${i + 1} sur 15`);
	}

	// Une ligne pour deux Opérations : r, r, Entrée à somme égale.
	await expect(page.locator('[data-ligne]:focus')).toContainText('VIR GROUPE');
	for (const texte of ['partie A', 'partie B']) {
		await page.keyboard.press('r');
		await expect(page.getByRole('combobox', { name: 'Opération à relier' })).toBeFocused();
		await page.keyboard.type(texte);
		await expect(page.getByRole('option')).toHaveCount(1);
		await expect(page.getByRole('option', { name: new RegExp(texte) })).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(page.locator('[data-ligne]:focus')).toContainText('VIR GROUPE');
	}
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('9 sur 15');

	// 0,01 € de différence : le bouton d'ajustement prend le focus.
	await expect(page.locator('[data-ligne]:focus')).toContainText('PRESTATION');
	await page.keyboard.press('r');
	await expect(page.getByRole('combobox', { name: 'Opération à relier' })).toBeFocused();
	await page.keyboard.type('Presque');
	await expect(page.getByRole('option')).toHaveCount(1);
	await expect(page.getByRole('option', { name: /Presque juste/ })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(volet(page)).toContainText('Il reste 0,01 € d’écart');
	await page.keyboard.press('Enter');
	await expect(volet(page).getByRole('button', { name: /Créer un ajustement/ })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('10 sur 15');

	// Une ligne reportée revient en fin de file.
	await expect(page.locator('[data-ligne]:focus')).toContainText('FRAIS BANCAIRES');
	await page.keyboard.press('p');
	await expect(page.locator('[data-ligne]:focus')).toContainText('CARTE LIBRE');
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('11 sur 15');

	// Quatre Opérations créées depuis leur ligne, au clavier.
	for (const [texte, sur] of [
		['INTERETS', 12],
		['COMMISSION', 13],
		['TIMBRES', 14],
		['FRAIS BANCAIRES', 15]
	] as const) {
		await expect(page.locator('[data-ligne]:focus')).toContainText(texte);
		await page.keyboard.press('c');
		const nature = panneau(page).getByRole('combobox', { name: 'Nature de la ligne 1' });
		await nature.focus();
		await page.keyboard.type('Papeterie');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Control+Enter');
		await expect(barre(page)).toContainText(`${sur} sur 15`);
		await expect(page.getByRole('dialog')).toHaveCount(0);
	}

	await expect(barre(page).getByRole('button', { name: /Écart de 0,00/ })).toBeVisible();
	await expect(volet(page).getByRole('heading', { name: 'Tout est pointé' })).toBeVisible();
	await axeSansViolation(page);
});

test('3.8 : Espace coche plusieurs lignes pour une Opération, 1 2 3 changent la sélection', async ({
	page
}) => {
	const id = compteVierge('Banque à cocher', 10000);
	await operation(page, {
		compteId: id,
		libelle: 'Transport de la sortie',
		montant: 5000,
		date: '2027-11-02'
	});
	await operation(page, {
		compteId: id,
		libelle: 'Transport, acompte',
		montant: 700,
		date: '2027-11-03'
	});
	await page.goto(`/pointage/${id}`);
	await choisirFichier(
		page,
		ofx(
			[
				{ date: '20271102', montant: '-30.00', id: 'E1', libelle: 'TRANSPORT ALLER' },
				{ date: '20271103', montant: '-20.00', id: 'E2', libelle: 'TRANSPORT RETOUR' }
			],
			{ montant: '50.00', date: '20271103' }
		)
	);
	await expect(barre(page)).toContainText('0 sur 2');
	await ligne(page, 'TRANSPORT ALLER').click();

	// Rien n'est présélectionné : aucune référence, aucun montant unique.
	const cartes = volet(page).locator('.proposition');
	await expect(cartes).toHaveCount(2);
	await expect(cartes.getByRole('button', { pressed: true })).toHaveCount(0);
	await expect(cartes.first()).toContainText('Libellé proche, montant différent');

	// Espace sans proposition choisie coche la ligne ; la suivante rejoint le Pointage.
	await page.keyboard.press(' ');
	await page.keyboard.press('ArrowDown');
	await expect(ligne(page, 'TRANSPORT RETOUR')).toBeFocused();
	await page.keyboard.press('1');
	await expect(cartes.nth(0).getByRole('button', { pressed: true })).toBeVisible();
	await expect(cartes.nth(1)).toContainText('Transport de la sortie');
	await page.keyboard.press('2');
	await expect(cartes.nth(1).getByRole('button', { pressed: true })).toBeVisible();

	const pose = volet(page).locator('.pose');
	await expect(pose).toContainText('Lignes de relevé');
	await expect(pose).toContainText('50,00');
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('2 sur 2');
	await page.keyboard.press('Control+z');
	await expect(barre(page)).toContainText('0 sur 2');

	// Espace sur une proposition la coche : deux Opérations pour une ligne, sans `r`.
	await ligne(page, 'TRANSPORT ALLER').click();
	await page.keyboard.press('1');
	await page.keyboard.press(' ');
	await expect(cartes.nth(0).getByRole('checkbox')).toBeChecked();
	await page.keyboard.press('2');
	await page.keyboard.press(' ');
	await expect(cartes.nth(1).getByRole('checkbox')).toBeChecked();
	await expect(pose).toContainText('Relié');
	await expect(pose).toContainText('57,00');
});

test('jeu de captures : une file vivante, à regarder', async ({ page }) => {
	const id = compteVierge('CCP imaginaire', 350000);
	await operation(page, {
		compteId: id,
		libelle: 'Autocars imaginaires',
		montant: 100000,
		date: '2027-11-04',
		reference: 'FA-2027-14'
	});
	await operation(page, {
		compteId: id,
		libelle: 'Autocars, acompte',
		montant: 25000,
		date: '2027-11-02'
	});
	await operation(page, {
		compteId: id,
		libelle: 'Papeterie fictive',
		montant: 2150,
		date: '2027-11-08'
	});
	await operation(page, {
		compteId: id,
		libelle: 'Cotisation imaginaire',
		montant: 2100,
		date: '2027-09-20'
	});
	const lignes: LigneOfx[] = [
		{ date: '20271103', montant: '-2100.00', id: 'C0', libelle: 'PRLV COTISATION ANNUELLE' },
		{
			date: '20271105',
			montant: '-1000.00',
			id: 'C1',
			libelle: 'VIR SEPA AUTOCARS IMAGINAIRES FA-2027-14'
		},
		{ date: '20271108', montant: '-21.50', id: 'C2', libelle: 'CB PAPETERIE DU COIN' },
		{ date: '20271109', montant: '-3.50', id: 'C3', libelle: 'FRAIS TENUE DE COMPTE' },
		{ date: '20271112', montant: '480.00', id: 'C4', libelle: 'REMISE CHEQUES ECOLE FICTIVE' },
		{ date: '20271115', montant: '-5.00', id: 'C5', libelle: 'CB BOULANGERIE IMAGINAIRE' },
		{ date: '20271115', montant: '-5.00', id: 'C6', libelle: 'CB BOULANGERIE IMAGINAIRE' }
	];
	await page.goto(`/pointage/${id}`);
	await choisirFichier(page, ofx(lignes, { montant: '845.00', date: '20271115' }));
	await expect(barre(page)).toContainText('0 sur 7');
	await ligne(page, 'CB PAPETERIE').click();
	await page.keyboard.press('Enter');
	await expect(barre(page)).toContainText('1 sur 7');
});
