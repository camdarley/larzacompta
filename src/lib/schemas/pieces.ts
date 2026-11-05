import { z } from 'zod';

const identifiant = z.number({ message: 'champ_requis' }).int().positive();

export const schemaRattachement = z.object({ operationId: identifiant });
