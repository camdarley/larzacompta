import { z } from 'zod';
import { LONGUEUR_MIN_MOT_DE_PASSE, THEMES } from '#lib/domaine/acces.ts';

const requis = (max = 200) => z.string().trim().min(1, 'champ_requis').max(max, 'champ_requis');
const motDePasse = z.string().min(LONGUEUR_MIN_MOT_DE_PASSE, 'mot_de_passe_court').max(1024);

export const schemaConnexion = z.object({
	identifiant: requis(),
	motDePasse: z.string().min(1, 'champ_requis').max(1024)
});

export const schemaInvitation = z.object({
	identifiant: requis().optional(),
	nomAffiche: requis().optional(),
	motDePasse
});

export const schemaCreationAcces = z.object({
	identifiant: requis(),
	nomAffiche: requis(),
	role: z.enum(['tresorier', 'lecteur', 'compteur'], { message: 'champ_requis' })
});

export const schemaMotDePasse = z.object({
	actuel: z.string().min(1, 'champ_requis').max(1024),
	nouveau: motDePasse
});

export const schemaPreferences = z.object({
	theme: z.enum(THEMES, { message: 'champ_requis' }),
	raccourcis: z.boolean()
});
