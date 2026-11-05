/**
 * Brouillon du Comptage (AD-10) : des quantités, rien d'autre, sur ce téléphone seulement.
 * Il survit à un rechargement et s'efface à l'enregistrement. Rien n'y est de la comptabilité.
 */
import type { CoupureJ } from '#lib/domaine/journal.ts';
import { COUPURES } from '#lib/domaine/caisse/index.ts';
import { centimes } from '#lib/domaine/montant.ts';

const cle = (nom: string) => `ape-comptage-${nom}`;

function stockage() {
	try {
		return window.localStorage;
	} catch {
		// Navigation privée, ou stockage refusé : le Comptage marche, sans brouillon.
		return null;
	}
}

export function lireBrouillon(nom: string): CoupureJ[] | null {
	try {
		const brut = stockage()?.getItem(cle(nom));
		if (!brut) return null;
		const lu = JSON.parse(brut) as Record<string, unknown>;
		return COUPURES.flatMap((coupure) => {
			const quantite = lu[String(coupure)];
			return Number.isInteger(quantite) && (quantite as number) > 0
				? [{ coupure: centimes(coupure), quantite: quantite as number }]
				: [];
		});
	} catch {
		return null;
	}
}

export function ecrireBrouillon(nom: string, coupures: readonly CoupureJ[]) {
	const quantites = Object.fromEntries(coupures.map((c) => [c.coupure, c.quantite]));
	try {
		stockage()?.setItem(cle(nom), JSON.stringify(quantites));
	} catch {
		// Stockage plein : le Comptage reste à l'écran.
	}
}

export function effacerBrouillon(nom: string) {
	stockage()?.removeItem(cle(nom));
}
