import { z } from 'zod';
import { montantFacultatif } from './parametrage.ts';

export const schemaLigneCompte = z.object({
	id: z.coerce.number().int().positive().optional().catch(undefined),
	libelle: z.string().trim().min(1, 'champ_requis').max(120, 'champ_requis'),
	type: z.enum(['banque', 'epargne', 'caisse'], { message: 'champ_requis' }),
	solde: montantFacultatif
});
