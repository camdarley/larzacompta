/**
 * Dernier aperçu de Facture de chaque Accès, en mémoire : ni fichier, ni base, ni Journal. L'iframe
 * ne sait lire qu'une adresse, et ce que la personne tape n'a rien à faire dans une URL (AD-21).
 */
const apercus = new Map<number, { octets: Uint8Array; nom: string }>();

export function poserApercu(accesId: number, octets: Uint8Array, nom: string) {
	apercus.set(accesId, { octets, nom });
}

export const lireApercu = (accesId: number) => apercus.get(accesId) ?? null;
