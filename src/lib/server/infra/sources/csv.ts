/**
 * Adaptateur CSV (AD-9) : encodage, séparateur et ligne d'en-tête. Le sens des colonnes vient
 * du `profil_csv`, appliqué par `#lib/domaine/releve/csv`, sans aucune règle propre à une banque.
 */
import Papa from 'papaparse';
import { appliquerReglage, type TableauCsv } from '#lib/domaine/releve/csv.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import type { SourceCsv } from '../../application/ports.ts';

const SEPARATEURS = [';', ',', '\t'] as const;
const OCTETS_MAX_CONTROLE = 4096;

function decoder(octets: Uint8Array): string {
	try {
		// `fatal` : un octet CP1252 n'est presque jamais de l'UTF-8 valide. Le BOM est retiré ici.
		return new TextDecoder('utf-8', { fatal: true }).decode(octets);
	} catch {
		return new TextDecoder('windows-1252').decode(octets);
	}
}

function ressembleATexte(octets: Uint8Array): boolean {
	return !octets.subarray(0, OCTETS_MAX_CONTROLE).some((o) => o === 0);
}

/** Le nombre de colonnes le plus fréquent : les rangées d'avant le tableau en ont moins. */
function largeurModale(rangees: string[][]): number {
	const n = new Map<number, number>();
	for (const r of rangees) n.set(r.length, (n.get(r.length) ?? 0) + 1);
	return [...n.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

function decouper(texte: string, separateur: string): string[][] {
	return Papa.parse<string[]>(texte, { delimiter: separateur, skipEmptyLines: 'greedy' }).data;
}

/** Le séparateur retenu est celui qui donne le plus de colonnes régulières. */
function meilleurDecoupage(texte: string): string[][] {
	const essais = SEPARATEURS.map((s) => {
		const rangees = decouper(texte, s);
		const largeur = largeurModale(rangees);
		const regulieres = rangees.filter((r) => r.length === largeur).length;
		return { rangees, score: largeur > 1 ? regulieres * largeur : 0 };
	});
	return [...essais].sort((a, b) => b.score - a.score)[0]?.rangees ?? [];
}

function tableau(octets: Uint8Array): Resultat<TableauCsv> {
	if (!ressembleATexte(octets)) return echec('fichier_illisible');
	const rangees = meilleurDecoupage(decoder(octets));
	const largeur = largeurModale(rangees);
	const debut = rangees.findIndex((r) => r.length === largeur);
	if (largeur < 2 || debut === -1 || rangees.length < debut + 2) return echec('fichier_illisible');
	const entetes = (rangees[debut] as string[]).map((e) => e.trim());
	if (entetes.some((e) => e === '') || new Set(entetes).size !== entetes.length) {
		return echec('fichier_illisible');
	}
	return succes({ entetes, lignes: rangees.slice(debut + 1).filter((r) => r.length >= largeur) });
}

export const sourceCsv: SourceCsv = {
	tableau,
	lire({ octets, reglage }) {
		if (!reglage) return echec('fichier_illisible');
		const t = tableau(octets);
		return t.ok ? appliquerReglage(t.valeur, reglage) : t;
	}
};
