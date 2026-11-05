/**
 * Saisie d'une Opération, partagée par le `panneau` et les endpoints JSON (AD-19).
 * Les montants circulent en centimes entiers, positifs : le sens vient de l'intention.
 */
import { z } from 'zod';
import { dateValide } from '#lib/domaine/dates.ts';
import { MODES_PAIEMENT, PHASES_SESSION } from '#lib/domaine/journal.ts';
import { MONTANT_MAX, centimes } from '#lib/domaine/montant.ts';

const montant = z
	.number({ message: 'montant_invalide' })
	.int('montant_invalide')
	.positive('montant_invalide')
	.max(MONTANT_MAX, 'montant_invalide')
	.transform(centimes);

const date = z.string({ message: 'champ_requis' }).refine(dateValide, 'date_invalide');
const identifiant = z.number({ message: 'champ_requis' }).int().positive();
const facultatifId = identifiant.nullable().default(null);
const libelle = z.string({ message: 'champ_requis' }).trim().min(1, 'champ_requis').max(200);
const texteLibre = (max: number) =>
	z
		.string()
		.trim()
		.max(max, 'champ_requis')
		.nullable()
		.default(null)
		.transform((v) => v || null);

const enTete = {
	libelle,
	reference: texteLibre(120),
	modePaiement: z.enum(MODES_PAIEMENT).nullable().default(null),
	note: texteLibre(2000),
	tiers: texteLibre(200),
	sansPiece: z.boolean().default(false)
};

const ligne = z.object({
	montant,
	contraire: z.boolean().default(false),
	reduction: z.boolean().default(false),
	natureId: identifiant,
	actionId: facultatifId,
	exerciceRattachementId: facultatifId,
	note: texteLibre(500)
});

export const schemaStandard = z.object({
	forme: z.literal('standard'),
	...enTete,
	intention: z.enum(['depense', 'recette']),
	compteId: identifiant,
	date,
	montant,
	lignes: z.array(ligne).min(1, 'forme_invalide').max(100)
});

export const schemaInterne = z.object({
	forme: z.literal('interne'),
	libelle,
	note: enTete.note,
	reference: enTete.reference,
	deId: identifiant,
	versId: identifiant,
	montant,
	parti: date,
	arrive: date
});

const ligneCompensee = z.object({
	natureId: identifiant,
	actionId: facultatifId,
	exerciceRattachementId: facultatifId
});

export const schemaCompensee = z.object({
	forme: z.literal('compensee'),
	...enTete,
	compteId: identifiant,
	date,
	facture: montant,
	ventes: montant,
	ligneFacture: ligneCompensee,
	ligneVentes: ligneCompensee
});

export const saisieOperation = z.discriminatedUnion('forme', [
	schemaStandard,
	schemaInterne,
	schemaCompensee
]);

export const cleSaisie = z.string().min(8).max(64).optional();

/** Pièces déposées pendant la saisie, rattachées avec l'Opération. */
export const piecesDeposees = z.array(identifiant).max(20).optional();

/** Réponse à la question d'une Session, par Compte (AD-10). */
export const phasesChoisies = z.record(z.string(), z.enum(PHASES_SESSION)).optional();

export const schemaCreation = z.intersection(
	saisieOperation,
	z.object({
		cle: cleSaisie,
		rendDe: identifiant.optional(),
		pieces: piecesDeposees,
		phases: phasesChoisies
	})
);

export const schemaModification = z.object({
	version: z.number().int().positive(),
	cle: cleSaisie,
	phases: phasesChoisies,
	saisie: saisieOperation
});

export const schemaSansPiece = z.object({ sansPiece: z.boolean() });

export const schemaRelier = z.object({ autreId: identifiant, libelle });

export const schemaCreationVolee = z.object({ libelle: libelle.max(120, 'champ_requis') });
