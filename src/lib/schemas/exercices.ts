import { z } from 'zod';

export const schemaRepere = z.object({
	libelle: z.string().trim().min(1, 'champ_requis').max(40, 'champ_requis')
});

export const schemaAnnee = z.object({
	anneeDebut: z.coerce.number().int().min(2000).max(2100)
});
