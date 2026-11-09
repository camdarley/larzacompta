/** Créances et Dettes : un formulaire de page, et le solde par endpoint JSON (AD-19). */
import { z } from 'zod';
import { dateValide } from '#lib/domaine/dates.ts';
import { centimes, lireMontant } from '#lib/domaine/montant.ts';
import { cleSaisie, piecesDeposees, schemaStandard } from './operations.ts';

const texte = (max: number) => z.string().trim().min(1, 'champ_requis').max(max, 'champ_requis');

const montantTexte = z
	.string({ message: 'champ_requis' })
	.trim()
	.min(1, 'champ_requis')
	.transform((brut, ctx) => {
		const lu = lireMontant(brut);
		if (lu.ok && lu.valeur > 0) return lu.valeur;
		ctx.addIssue({ code: 'custom', message: 'montant_invalide' });
		return z.NEVER;
	});

const actionFacultative = z.preprocess(
	(v) => (v === '' || v === undefined ? null : v),
	z.coerce.number().int().positive().nullable()
);

const noteFacultative = z
	.string()
	.trim()
	.max(2000, 'champ_requis')
	.optional()
	.transform((v) => v || null);

export const schemaCreance = z.object({
	sens: z.enum(['creance', 'dette'], { message: 'champ_requis' }),
	tiers: texte(200),
	motif: texte(200),
	montant: montantTexte,
	date: z.string({ message: 'champ_requis' }).refine(dateValide, 'date_invalide'),
	actionId: actionFacultative,
	note: noteFacultative,
	/** Déposées dans le panneau, jointes à la somme dans sa transaction. Champ « 12,13 ». */
	pieces: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() !== '' ? v.split(',') : []),
		z.array(z.coerce.number().int().positive()).max(20)
	)
});

/** Reprise à l'assistant : la date est celle de la reprise, posée par le serveur. */
export const schemaReprise = schemaCreance.omit({ date: true, note: true, pieces: true });

export const partsReglement = z
	.array(
		z.object({
			creanceId: z.number().int().positive(),
			montant: z.number().int().positive().transform(centimes)
		})
	)
	.min(1)
	.max(20);

export const schemaSolder = z.object({
	parts: partsReglement,
	saisie: schemaStandard,
	pieces: piecesDeposees,
	cle: cleSaisie
});
