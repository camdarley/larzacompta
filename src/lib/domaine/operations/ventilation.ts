/**
 * Reste à répartir : le même code tourne dans le panneau, à chaque frappe, et sur le serveur.
 * Les montants saisis sont positifs : le sens est porté par `contraire`.
 */
import { centimes, type Centimes } from '../montant.ts';

export type PartLigne = { montant: Centimes; contraire: boolean };

export function totalReparti(lignes: readonly PartLigne[]): Centimes {
	let total = 0;
	for (const l of lignes) total += l.contraire ? -l.montant : l.montant;
	return centimes(total);
}

/** Positif : il manque. Négatif : il y a trop. Nul : tout est réparti. */
export function resteARepartir(total: Centimes, lignes: readonly PartLigne[]): Centimes {
	return centimes(total - totalReparti(lignes));
}

/** Montant qui, porté par la Ligne `i`, annule le reste : c'est ce que `=` insère. */
export function montantPourSolder(
	total: Centimes,
	lignes: readonly PartLigne[],
	i: number
): Centimes {
	const autres = lignes.filter((_, n) => n !== i);
	const reste = resteARepartir(total, autres);
	return centimes(Math.max(0, lignes[i]?.contraire ? -reste : reste));
}
