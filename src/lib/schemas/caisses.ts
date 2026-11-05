/** Comptage, partagé par l'écran et les endpoints JSON. Les totaux ne voyagent jamais. */
import { z } from 'zod';
import { COUPURES } from '#lib/domaine/caisse/index.ts';
import { dateValide } from '#lib/domaine/dates.ts';
import { centimes } from '#lib/domaine/montant.ts';

const date = z.string().refine(dateValide, 'date_invalide');
const coupure = z
	.number()
	.refine((v) => (COUPURES as readonly number[]).includes(v), 'montant_invalide')
	.transform(centimes);

const coupures = z
	.array(z.object({ coupure, quantite: z.number().int().min(1).max(1_000_000) }))
	.max(COUPURES.length)
	.refine((l) => new Set(l.map((c) => c.coupure)).size === l.length, 'montant_invalide');

const commun = {
	coupures,
	date,
	/** Total du Comptage précédent : le même total confirme la différence (C9). */
	confirmation: z
		.number()
		.int()
		.nullable()
		.optional()
		.transform((v) => (v == null ? null : centimes(v)))
};

export const schemaComptageCaisse = z.object({
	...commun,
	/** Absent : réserve. `null` : « Sans Action ». */
	actionId: z.number().int().positive().nullable().optional()
});

export const schemaComptageSession = z.object({
	...commun,
	corriger: z.boolean().optional()
});
