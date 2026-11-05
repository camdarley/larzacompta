/**
 * Adaptateur OFX 1.02 SGML (AD-9), sans bibliothèque : les balises n'y sont pas toujours fermées,
 * et un fichier ne sert jamais à moitié. Toute anomalie refuse le fichier entier.
 */
import { dateValide, type DateCivile } from '#lib/domaine/dates.ts';
import { centimes, type Centimes } from '#lib/domaine/montant.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { LigneNormalisee, ReleveNormalise, SoldeLu } from '#lib/domaine/releve/types.ts';
import type { SourceReleve } from '../../application/ports.ts';

const illisible = () => echec<never>('fichier_illisible');

function decoder(octets: Uint8Array, enTete: string): string {
	const utf8 = /ENCODING:\s*UTF-?8/i.test(enTete);
	return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(octets);
}

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function texte(brut: string): string {
	return brut
		.replace(/&(amp|lt|gt|quot|apos);/g, (_, nom: string) => ENTITES[nom] ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Valeur d'une balise SGML : elle court jusqu'à la balise suivante, fermée ou non. */
function valeur(bloc: string, balise: string): string | null {
	const m = new RegExp(`<${balise}>([^<]*)`, 'i').exec(bloc);
	return m === null ? null : texte(m[1] ?? '');
}

/** Parcours linéaire : une expression paresseuse devient quadratique sur un fichier sans fermeture. */
function blocs(contenu: string, balise: string): string[] {
	const trouves: string[] = [];
	let debut: number | null = null;
	for (const m of contenu.matchAll(new RegExp(`<(/?)${balise}>`, 'gi'))) {
		if (m[1] === '') debut ??= m.index + m[0].length;
		else if (debut !== null) {
			trouves.push(contenu.slice(debut, m.index));
			debut = null;
		}
	}
	return trouves;
}

/** `20260312`, `20260312120000[+1:CET]`. */
function dateOfx(brut: string | null): DateCivile | null {
	const m = brut === null ? null : /^(\d{4})(\d{2})(\d{2})/.exec(brut);
	if (m === null) return null;
	const date = `${m[1]}-${m[2]}-${m[3]}`;
	return dateValide(date) ? date : null;
}

/** `-1000.00`, `12,5`, `+3` deviennent des centimes, sans passer par un flottant. */
function montantOfx(brut: string | null): Centimes | null {
	const m = brut === null ? null : /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(brut);
	if (m === null) return null;
	const [, signe = '', euros = '', decimales = ''] = m;
	const valeurAbsolue = Number(euros) * 100 + Number(decimales.padEnd(2, '0'));
	if (!Number.isSafeInteger(valeurAbsolue)) return null;
	return centimes(signe === '-' ? -valeurAbsolue : valeurAbsolue);
}

function ligneDe(bloc: string): Resultat<LigneNormalisee | null> {
	const date = dateOfx(valeur(bloc, 'DTPOSTED'));
	const montant = montantOfx(valeur(bloc, 'TRNAMT'));
	if (date === null || montant === null) return illisible();
	if (montant === 0) return succes(null);
	return succes({
		date,
		montant,
		libelle: valeur(bloc, 'NAME') || valeur(bloc, 'MEMO') || 'Sans libellé',
		identifiant: valeur(bloc, 'FITID') || null
	});
}

function soldeDe(contenu: string): Resultat<SoldeLu | null> {
	const [bloc] = blocs(contenu, 'LEDGERBAL');
	if (bloc === undefined) return succes(null);
	const date = dateOfx(valeur(bloc, 'DTASOF'));
	const montant = montantOfx(valeur(bloc, 'BALAMT'));
	return date === null || montant === null ? illisible() : succes({ date, montant });
}

export function estOfx(octets: Uint8Array): boolean {
	const debut = new TextDecoder('latin1').decode(octets.subarray(0, 4096));
	return /OFXHEADER\s*:/i.test(debut) || /<OFX>/i.test(debut);
}

function lire(octets: Uint8Array): Resultat<ReleveNormalise> {
	const enTete = new TextDecoder('latin1').decode(octets.subarray(0, 512));
	if (!/^\s*OFXHEADER\s*:/i.test(enTete)) return illisible();

	const contenu = decoder(octets, enTete);
	// Un fichier tronqué perd sa fermeture : aucune de ses lignes n'est fiable.
	if (!/<\/OFX>\s*$/i.test(contenu) || !/<\/BANKTRANLIST>/i.test(contenu)) return illisible();

	// Un seul Compte par import : deux relevés se fondraient dans celui qui est ouvert à l'écran.
	if ((contenu.match(/<BANKTRANLIST>/gi)?.length ?? 0) > 1) {
		return echec('releve_plusieurs_comptes');
	}

	const lignes: LigneNormalisee[] = [];
	for (const bloc of blocs(contenu, 'STMTTRN')) {
		const ligne = ligneDe(bloc);
		if (!ligne.ok) return ligne;
		if (ligne.valeur !== null) lignes.push(ligne.valeur);
	}
	// Autant d'ouvertures que de fermetures, sinon une ligne a disparu.
	if (contenu.match(/<STMTTRN>/gi)?.length !== contenu.match(/<\/STMTTRN>/gi)?.length) {
		return illisible();
	}
	const solde = soldeDe(contenu);
	if (!solde.ok) return solde;
	return succes({ lignes, solde: solde.valeur, compte: valeur(contenu, 'ACCTID') });
}

export const sourceOfx: SourceReleve = { lire: ({ octets }) => lire(octets) };
