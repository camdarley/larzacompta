/** Une rangée du Budget à sa sortie de champ. `montant` à `null` : le champ a été vidé. */
import { z } from 'zod';
import { MONTANT_MAX, centimes } from '#lib/domaine/montant.ts';

const id = z.number().int().positive();

export const schemaLigneBudget = z.object({
	exerciceId: id,
	actionId: id.nullable(),
	natureId: id,
	sens: z.enum(['recette', 'depense']),
	montant: z
		.number({ message: 'montant_invalide' })
		.int('montant_invalide')
		.min(0, 'montant_invalide')
		.max(MONTANT_MAX, 'montant_invalide')
		.transform(centimes)
		.nullable()
});

export type EntreeLigneBudget = z.output<typeof schemaLigneBudget>;
