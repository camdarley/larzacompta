import { z } from 'zod';
import { lireMontant, centimes } from '#lib/domaine/montant.ts';

const libelle = z.string().trim().min(1, 'champ_requis').max(120, 'champ_requis');
const identifiantEntier = z.coerce.number().int().positive();
const caseACocher = z
	.union([z.literal('on'), z.literal('true'), z.boolean()])
	.optional()
	.transform((v) => v === 'on' || v === 'true' || v === true);

/** Vide vaut 0 : un Compte sans solde saisi part de zéro. */
export const montantFacultatif = z
	.string()
	.optional()
	.transform((texte, contexte) => {
		if (texte === undefined || texte.trim() === '') return centimes(0);
		const r = lireMontant(texte);
		if (r.ok) return r.valeur;
		contexte.addIssue({ code: 'custom', message: 'montant_invalide' });
		return z.NEVER;
	});

export const schemaAssociation = z.object({
	nom: libelle,
	adresse: z.string().trim().max(500, 'champ_requis').default(''),
	moisDebutExercice: z.coerce.number().int().min(1).max(12),
	mentionsFacture: z.string().trim().max(2000, 'champ_requis').default('')
});

/** `cheques_a_remettre` naît avec la migration du jalon 2 : jamais à la main. */
export const schemaCompte = z.object({
	libelle,
	type: z.enum(['banque', 'epargne', 'caisse'], { message: 'champ_requis' }),
	soldeDepart: montantFacultatif,
	exerciceId: z.coerce.number().int().positive().optional().catch(undefined)
});

export const schemaCompteExistant = schemaCompte.extend({ id: identifiantEntier });

export const schemaGroupe = z.object({ libelle });

export const schemaNature = z.object({
	libelle,
	groupeId: identifiantEntier,
	neutre: caseACocher
});

export const schemaAction = z.object({
	libelle,
	groupeId: identifiantEntier,
	avecCaisse: caseACocher
});

export const schemaGroupeExistant = schemaGroupe.extend({ id: identifiantEntier });
export const schemaNatureExistante = schemaNature.extend({ id: identifiantEntier });
export const schemaActionExistante = schemaAction.extend({ id: identifiantEntier });

export const schemaId = z.object({ id: identifiantEntier });

export const schemaActivation = z.object({
	id: identifiantEntier,
	actif: z.enum(['0', '1']).transform((v) => v === '1')
});

export const schemaDeplacement = z.object({
	id: identifiantEntier,
	sens: z.enum(['monter', 'descendre'])
});
