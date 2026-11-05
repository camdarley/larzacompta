import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReglageCsv } from '#lib/domaine/releve/csv.ts';
import { creerFichiers } from '#lib/server/infra/fichiers/index.ts';
import { sourceCsv } from '#lib/server/infra/sources/csv.ts';
import { estOfx, sourceOfx } from '#lib/server/infra/sources/ofx.ts';
import { LIBELLE_LONG, LIGNES_FICTIVES, ofxCp1252, ofxTexte } from '../jeux/releve-fictif.ts';
import { parcourir, relatif } from '../projet/fichiers.ts';

const lire = (texte: string) => sourceOfx.lire({ octets: ofxCp1252(texte) });
const illisible = { ok: false, erreur: { code: 'fichier_illisible' } };

describe('adaptateur ofx (story 3.1)', () => {
	it('lit lignes, accents, identifiants et solde, en centimes exacts', () => {
		const r = lire(
			ofxTexte([
				...LIGNES_FICTIVES,
				{
					date: '20261015120000[+1:CET]',
					montant: '-0.07',
					id: 'A000000004',
					libelle: LIBELLE_LONG
				}
			])
		);
		expect(r).toEqual({
			ok: true,
			valeur: {
				lignes: [
					{
						date: '2026-10-05',
						montant: -100000,
						libelle: 'VIR SEPA AUTOCARS IMAGINAIRES FA-2026-14',
						identifiant: 'A000000001'
					},
					{
						date: '2026-10-08',
						montant: -350,
						libelle: 'FRAIS TENUE DE COMPTE',
						identifiant: 'A000000002'
					},
					{
						date: '2026-10-12',
						montant: 48000,
						libelle: 'REMISE CHÈQUES ÉCOLE FICTIVE',
						identifiant: 'A000000003'
					},
					{ date: '2026-10-15', montant: -7, libelle: LIBELLE_LONG, identifiant: 'A000000004' }
				],
				solde: { date: '2026-10-20', montant: 150000 }
			}
		});
		expect(LIBELLE_LONG.length).toBe(123);
	});

	it('n’utilise pas de flottant sur des montants qui en souffriraient', () => {
		const r = lire(ofxTexte([{ date: '20261005', montant: '-1.15', libelle: 'X' }]));
		expect(r.ok && r.valeur.lignes[0]?.montant).toBe(-115);
	});

	it('accepte un montant à virgule, sans identifiant, et sans solde', () => {
		const r = lire(ofxTexte([{ date: '20261005', montant: '12,5', libelle: 'X &amp; Y' }], null));
		expect(r).toEqual({
			ok: true,
			valeur: {
				lignes: [{ date: '2026-10-05', montant: 1250, libelle: 'X & Y', identifiant: null }],
				solde: null
			}
		});
	});

	it('une ligne à zéro n’est pas un mouvement', () => {
		const r = lire(ofxTexte([{ date: '20261005', montant: '0.00', libelle: 'X' }]));
		expect(r.ok && r.valeur.lignes).toEqual([]);
	});

	it('décode l’UTF-8 si l’en-tête le dit', () => {
		const texte = ofxTexte([{ date: '20261005', montant: '1.00', libelle: 'ÉCOLE' }]).replace(
			'ENCODING:USASCII',
			'ENCODING:UTF-8'
		);
		const r = sourceOfx.lire({ octets: new TextEncoder().encode(texte) });
		expect(r.ok && r.valeur.lignes[0]?.libelle).toBe('ÉCOLE');
	});

	it('fichier sans en-tête OFX : une seule erreur, aucune ligne', () => {
		const texte = ofxTexte(LIGNES_FICTIVES).replace(/^[\s\S]*?<OFX>/, '<OFX>');
		expect(lire(texte)).toEqual(illisible);
	});

	it('fichier tronqué : une seule erreur, aucune ligne', () => {
		const complet = ofxTexte(LIGNES_FICTIVES);
		expect(lire(complet.slice(0, complet.indexOf('</BANKTRANLIST>') - 40))).toEqual(illisible);
		expect(lire(complet.replace('</OFX>', ''))).toEqual(illisible);
		expect(lire(complet.replace('</STMTTRN>', ''))).toEqual(illisible);
	});

	it.each([
		['montant illisible', { date: '20261005', montant: 'douze', libelle: 'X' }],
		['montant à trois décimales', { date: '20261005', montant: '1.234', libelle: 'X' }],
		['date illisible', { date: '20261345', montant: '1.00', libelle: 'X' }]
	])('%s : refus total, même après une ligne juste', (_, mauvaise) => {
		expect(lire(ofxTexte([...LIGNES_FICTIVES, mauvaise]))).toEqual(illisible);
	});

	it('solde illisible : refus total', () => {
		expect(lire(ofxTexte(LIGNES_FICTIVES, { montant: 'x', date: '20261020' }))).toEqual(illisible);
	});

	it('reconnaît un OFX, avec ou sans en-tête', () => {
		expect(estOfx(ofxCp1252(ofxTexte([])))).toBe(true);
		expect(estOfx(ofxCp1252('<OFX></OFX>'))).toBe(true);
		expect(estOfx(ofxCp1252('Date;Montant\n'))).toBe(false);
	});

	it('n’emploie aucune bibliothèque OFX', () => {
		const code = readFileSync('src/lib/server/infra/sources/ofx.ts', 'utf8');
		const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
		expect(imports.every((i) => i?.startsWith('#lib/') || i?.startsWith('.'))).toBe(true);
		const paquet = readFileSync('package.json', 'utf8');
		expect(paquet).not.toMatch(/ofx/i);
	});

	it('rien de propre à une banque ne sort de infra/sources', () => {
		const dehors = parcourir('src', ['.ts', '.svelte'])
			.map(relatif)
			.filter((f) => !f.startsWith('src/lib/server/infra/sources/'))
			.filter((f) => /\b(STMTTRN|TRNAMT|FITID|DTPOSTED|LEDGERBAL)\b/.test(readFileSync(f, 'utf8')));
		expect(dehors).toEqual([]);
	});
});

describe('adaptateur csv (story 3.4)', () => {
	const reglage: ReglageCsv = {
		date: 'Date',
		libelle: 'Libellé',
		identifiant: null,
		montant: { mode: 'unique', colonne: 'Montant' }
	};
	const utf8 = (t: string) => new TextEncoder().encode(t);

	it.each([
		['point-virgule', ';'],
		['virgule', ','],
		['tabulation', '\t']
	])('reconnaît le séparateur %s', (_, s) => {
		const t = [`Date${s}Libellé${s}Montant`, `12/03/2026${s}École${s}"1 234,56"`].join('\n');
		const r = sourceCsv.lire({ octets: utf8(t), reglage });
		expect(r.ok && r.valeur.lignes).toEqual([
			{ date: '2026-03-12', montant: 123456, libelle: 'École', identifiant: null }
		]);
	});

	it('lit le CP1252 et l’UTF-8 avec BOM', () => {
		const t = 'Date;Libellé;Montant\n12/03/2026;Chèque école;1234.56\n';
		const cp = sourceCsv.lire({ octets: new Uint8Array(Buffer.from(t, 'latin1')), reglage });
		expect(cp.ok && cp.valeur.lignes[0]).toMatchObject({
			libelle: 'Chèque école',
			montant: 123456
		});
		const bom = sourceCsv.lire({ octets: utf8(`﻿${t}`), reglage });
		expect(bom.ok && bom.valeur.lignes[0]?.libelle).toBe('Chèque école');
	});

	it('trouve le tableau sous un préambule', () => {
		const t = [
			'Compte fictif;00000',
			'Solde;12,00',
			'',
			'Date;Libellé;Montant',
			'12/03/2026;A;1,00',
			'13/03/2026;B;2,00'
		].join('\n');
		const r = sourceCsv.tableau(utf8(t));
		expect(r.ok && r.valeur.entetes).toEqual(['Date', 'Libellé', 'Montant']);
		expect(r.ok && r.valeur.lignes).toHaveLength(2);
	});

	it.each([
		['du texte sans colonne', 'bonjour\nmadame\n'],
		['un en-tête seul', 'Date;Libellé\n'],
		['deux colonnes de même nom', 'A;A\n1;2\n3;4\n'],
		['un en-tête vide', 'A;\n1;2\n3;4\n']
	])('refuse %s', (_, t) => {
		expect(sourceCsv.tableau(utf8(t))).toEqual(illisible);
	});

	it('refuse un fichier binaire', () => {
		expect(sourceCsv.tableau(new Uint8Array([0x25, 0x50, 0, 1, 2]))).toEqual(illisible);
	});

	it('sans réglage, rien ne se lit', () => {
		expect(sourceCsv.lire({ octets: utf8('A;B\n1;2\n') })).toEqual(illisible);
	});

	it('une colonne manquante remonte', () => {
		const r = sourceCsv.lire({ octets: utf8('Date;Libellé;Valeur\n12/03/2026;A;1\n'), reglage });
		expect(r).toMatchObject({ ok: false, erreur: { code: 'format_change' } });
		expect(sourceCsv.lire({ octets: utf8('bonjour\n'), reglage })).toEqual(illisible);
	});
});

describe('stockage de fichiers (AD-16)', () => {
	it('adresse par SHA-256, écrit puis renomme, et ne garde aucun temporaire', () => {
		const dossier = mkdtempSync(join(tmpdir(), 'ape-fichiers-'));
		try {
			const f = creerFichiers(dossier);
			const octets = new TextEncoder().encode('relevé fictif');
			const sha = f.ecrire(octets);
			expect(sha).toMatch(/^[0-9a-f]{64}$/);
			const chemin = join(dossier, sha.slice(0, 2), sha);
			expect(existsSync(chemin)).toBe(true);
			expect(readFileSync(chemin, 'utf8')).toBe('relevé fictif');
			expect(f.ecrire(octets)).toBe(sha);
			expect(readdirSync(join(dossier, sha.slice(0, 2)))).toEqual([sha]);
		} finally {
			rmSync(dossier, { recursive: true });
		}
	});

	it('ne laisse pas de temporaire si l’écriture échoue', () => {
		const dossier = mkdtempSync(join(tmpdir(), 'ape-fichiers-'));
		try {
			const f = creerFichiers(dossier);
			expect(() => f.ecrire(null as unknown as Uint8Array)).toThrow();
		} finally {
			rmSync(dossier, { recursive: true });
		}
	});
});
