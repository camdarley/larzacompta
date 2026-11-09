import { z } from 'zod';

const identifiant = z.number({ message: 'champ_requis' }).int().positive();

/** À une Opération, ou à une Créance ou Dette. */
export const schemaRattachement = z.union([
	z.object({ operationId: identifiant }),
	z.object({ creanceId: identifiant })
]);
