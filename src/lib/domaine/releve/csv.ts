/**
 * Lecture d'un tableau de relevé, sans rien connaître d'une banque.
 * Pure : l'aperçu de l'écran de correspondance appelle le même code que l'import.
 */
import { dateValide, type DateCivile } from '../dates.ts';
import { centimes, type Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';
import type { LigneNormalisee, ReleveNormalise } from './types.ts';

export type TableauCsv = { entetes: string[]; lignes: string[][] };

export type ColonnesMontant =
	{ mode: 'unique'; colonne: string } | { mode: 'separees'; sorties: string; entrees: string };

/** Réglage retenu pour un Compte (`profil_csv`). Les colonnes se retrouvent par leur nom. */
export type ReglageCsv = {
	date: string;
	libelle: string;
	identifiant: string | null;
	montant: ColonnesMontant;
};

const ESPACES = /[\s  ]/g;

/** `1 234,56`, `1234.56`, `1.234,56`, `-12,50`, `12,50-`, `12,50 €`. Tout passe par des chaînes. */
export function lireMontantCsv(texte: string): Centimes | null {
	const net = texte
		.replace(ESPACES, '')
		.replace(/€|EUR$/i, '')
		.replace(/−/g, '-');
	const m = /^([+-]?)(\d[\d.,']*?)(?:([.,])(\d{1,2}))?([+-]?)$/.exec(net);
	if (m === null) return null;
	const [, avant = '', entier = '', virgule = '', decimales = '', apres = ''] = m;
	// Ce qui reste comme séparateur groupe des milliers, par trois, et n'est pas la virgule décimale.
	const groupes = entier.split(/[.,']/);
	if (groupes.length > 1 && groupes.slice(1).some((g) => g.length !== 3)) return null;
	if (virgule !== '' && entier.includes(virgule)) return null;
	const valeur = Number(groupes.join('')) * 100 + Number(decimales.padEnd(2, '0'));
	if (!Number.isSafeInteger(valeur)) return null;
	return centimes(avant === '-' || apres === '-' ? -valeur : valeur);
}

/** `12/03/2026`, `12-03-2026`, `12.03.26`, `2026-03-12`. */
export function lireDateCsv(texte: string): DateCivile | null {
	const net = texte.trim().split(/[ T]/)[0] ?? '';
	if (dateValide(net)) return net;
	const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(net);
	if (m === null) return null;
	const [, jour = '', mois = '', annee = ''] = m;
	const date = `${annee.padStart(4, '20')}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}`;
	return dateValide(date) ? date : null;
}

/** Index de chaque colonne du réglage : une colonne disparue refuse tout le fichier. */
function colonnes(t: TableauCsv, r: ReglageCsv): Resultat<(ligne: string[]) => LigneBrute> {
	const noms = [
		r.date,
		r.libelle,
		...(r.identifiant === null ? [] : [r.identifiant]),
		...(r.montant.mode === 'unique' ? [r.montant.colonne] : [r.montant.sorties, r.montant.entrees])
	];
	const absente = noms.find((n) => !t.entetes.includes(n));
	if (absente !== undefined) return echec('format_change', { colonne: absente });

	const lire = (ligne: string[], nom: string) => (ligne[t.entetes.indexOf(nom)] ?? '').trim();
	const montant = r.montant;
	return succes((ligne) => ({
		date: lire(ligne, r.date),
		libelle: lire(ligne, r.libelle).replace(/\s+/g, ' '),
		identifiant: r.identifiant === null ? '' : lire(ligne, r.identifiant),
		unique: montant.mode === 'unique' ? lire(ligne, montant.colonne) : '',
		sorties: montant.mode === 'separees' ? lire(ligne, montant.sorties) : '',
		entrees: montant.mode === 'separees' ? lire(ligne, montant.entrees) : ''
	}));
}

type LigneBrute = {
	date: string;
	libelle: string;
	identifiant: string;
	unique: string;
	sorties: string;
	entrees: string;
};

/** Une sortie est toujours négative, qu'elle soit écrite avec ou sans signe. */
function montantDe(b: LigneBrute): Centimes | null {
	if (b.unique !== '') return lireMontantCsv(b.unique);
	const sortie = b.sorties === '' ? centimes(0) : lireMontantCsv(b.sorties);
	const entree = b.entrees === '' ? centimes(0) : lireMontantCsv(b.entrees);
	if (sortie === null || entree === null) return null;
	return centimes(Math.abs(entree) - Math.abs(sortie));
}

export function appliquerReglage(t: TableauCsv, r: ReglageCsv): Resultat<ReleveNormalise> {
	const lecteur = colonnes(t, r);
	if (!lecteur.ok) return lecteur;

	const lignes: LigneNormalisee[] = [];
	for (const brute of t.lignes) {
		const b = lecteur.valeur(brute);
		// Une rangée de total ou une rangée vide n'est pas un mouvement.
		if (b.date === '') continue;
		const date = lireDateCsv(b.date);
		const montant = montantDe(b);
		if (date === null || montant === null) return echec('fichier_illisible');
		if (montant === 0) continue;
		lignes.push({
			date,
			montant,
			libelle: b.libelle || 'Sans libellé',
			identifiant: b.identifiant || null
		});
	}
	return lignes.length === 0 ? echec('fichier_illisible') : succes({ lignes, solde: null });
}

/** Devine une première correspondance, à vérifier à l'écran. */
export function reglagePropose(entetes: readonly string[]): ReglageCsv {
	const trouver = (motif: RegExp) => entetes.find((e) => motif.test(e));
	const sorties = trouver(/sortie|d[ée]bit|d[ée]pense/i);
	const entrees = trouver(/entr[ée]e|cr[ée]dit|recette/i);
	const premiere = entetes[0] ?? '';
	return {
		date: trouver(/date/i) ?? premiere,
		libelle: trouver(/libell|intitul|description|nature|objet/i) ?? entetes[1] ?? premiere,
		identifiant: trouver(/identifiant|r[ée]f/i) ?? null,
		montant:
			sorties && entrees
				? { mode: 'separees', sorties, entrees }
				: {
						mode: 'unique',
						colonne: trouver(/montant|valeur|somme/i) ?? entetes.at(-1) ?? premiere
					}
	};
}
