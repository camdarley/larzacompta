/** Saisie des Chèques, partagée par les écrans et les endpoints JSON (AD-19). */
import { z } from 'zod';
import { dateValide } from '#lib/domaine/dates.ts';
import { MONTANT_MAX, centimes } from '#lib/domaine/montant.ts';
import { cleSaisie } from './operations.ts';

const montant = z
	.number({ message: 'montant_invalide' })
	.int('montant_invalide')
	.positive('montant_invalide')
	.max(MONTANT_MAX, 'montant_invalide')
	.transform(centimes);

const date = z.string({ message: 'champ_requis' }).refine(dateValide, 'date_invalide');
const identifiant = z.number({ message: 'champ_requis' }).int().positive();
const facultatifId = identifiant.nullable().default(null);
const texte = (max: number) =>
	z.string({ message: 'champ_requis' }).trim().min(1, 'champ_requis').max(max, 'champ_requis');
const texteLibre = (max: number) =>
	z
		.string()
		.trim()
		.max(max, 'champ_requis')
		.nullable()
		.default(null)
		.transform((v) => v || null);

const ligne = z.object({
	montant,
	contraire: z.boolean().default(false),
	reduction: z.boolean().default(false),
	natureId: identifiant,
	actionId: facultatifId,
	exerciceRattachementId: facultatifId,
	note: texteLibre(500)
});

const chequeRecu = {
	emetteur: texte(200),
	banque: texteLibre(120),
	numero: texteLibre(40),
	date,
	montant,
	lignes: z.array(ligne).min(1, 'forme_invalide').max(100)
};

export const schemaChequeRecu = z.object({ ...chequeRecu, cle: cleSaisie });

export const schemaModificationCheque = z.object({
	...chequeRecu,
	version: z.number().int().positive()
});

export const schemaRemise = z.object({
	chequeIds: z.array(identifiant).max(1000),
	compteId: identifiant,
	date,
	total: z.number().int().nonnegative().transform(centimes)
});

export const schemaRejet = z.object({ date });

export const schemaFormule = z.object({
	numero: texte(40),
	beneficiaire: texteLibre(200)
});
