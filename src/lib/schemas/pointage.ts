/** Entrées du Pointage, partagées par l'interface et les endpoints JSON (AD-19). */
import { z } from 'zod';
import { dateValide } from '#lib/domaine/dates.ts';
import { centimes } from '#lib/domaine/montant.ts';
import { saisieOperation, cleSaisie } from './operations.ts';

const MONTANT_MAX = 100_000_000_00;
const identifiant = z.number({ message: 'champ_requis' }).int().positive();
const date = z.string({ message: 'champ_requis' }).refine(dateValide, 'date_invalide');
const signe = z
	.number({ message: 'montant_invalide' })
	.int('montant_invalide')
	.min(-MONTANT_MAX, 'montant_invalide')
	.max(MONTANT_MAX, 'montant_invalide');

export const schemaPointage = z.object({
	compteId: identifiant,
	coteIds: z.array(identifiant).max(200),
	ligneIds: z.array(identifiant).max(200)
});

export const schemaLigneReleve = z.object({
	date,
	montant: signe.refine((m) => m !== 0, 'montant_invalide').transform(centimes),
	libelle: z.string({ message: 'champ_requis' }).trim().min(1, 'champ_requis').max(200)
});

export const schemaSolde = z.object({ date, solde: signe.transform(centimes) });

export const schemaDepuisLigne = z.object({
	ligneId: identifiant,
	cle: cleSaisie,
	saisie: saisieOperation
});

const colonne = z.string().min(1, 'champ_requis').max(200);

export const schemaReglage = z.object({
	date: colonne,
	libelle: colonne,
	identifiant: colonne.nullable(),
	montant: z.discriminatedUnion('mode', [
		z.object({ mode: z.literal('unique'), colonne }),
		z.object({ mode: z.literal('separees'), sorties: colonne, entrees: colonne })
	])
});
