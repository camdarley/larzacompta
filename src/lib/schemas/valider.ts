import type { z } from 'zod';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';

/**
 * Toute entrée passe un schéma (AD-19). Le message d'un refus Zod est un code de `#lib/messages`,
 * rendu champ par champ : `{ code: 'saisie_invalide', details: { champs: { nom: 'champ_requis' } } }`.
 */
export function valider<S extends z.ZodType>(schema: S, brut: unknown): Resultat<z.output<S>> {
	const r = schema.safeParse(brut);
	if (r.success) return succes(r.data);
	const champs: Record<string, string> = {};
	for (const probleme of r.error.issues) {
		const nom = probleme.path.join('.');
		champs[nom] ??= /^[a-z_]+$/.test(probleme.message) ? probleme.message : 'champ_requis';
	}
	return echec('saisie_invalide', { champs });
}
