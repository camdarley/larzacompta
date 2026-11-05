/** Brouillon de Facture : souple à l'enregistrement, F3 ne contrôle le reste qu'à la validation. */
import { z } from 'zod';
import { dateValide } from '#lib/domaine/dates.ts';
import { MONTANT_MAX, centimes } from '#lib/domaine/montant.ts';

const MAX_LIGNES = 200;

const ligne = z.object({
	designation: z.string().trim().min(1, 'champ_requis').max(300, 'champ_requis'),
	quantite: z
		.number({ message: 'quantite_invalide' })
		.int('quantite_invalide')
		.positive('quantite_invalide')
		.max(1_000_000, 'quantite_invalide'),
	prixUnitaire: z
		.number({ message: 'montant_invalide' })
		.int('montant_invalide')
		.min(0, 'montant_invalide')
		.max(MONTANT_MAX, 'montant_invalide')
		.transform(centimes)
});

/**
 * Quantité et prix tiennent chacun sous leur limite, pas forcément leur produit. Un total hors
 * plafond ne s'enregistre pas, même en brouillon : il casserait ce qui le relit.
 */
const lignes = z
	.array(ligne)
	.max(MAX_LIGNES, 'champ_requis')
	.superRefine((liste, ctx) => {
		let total = 0;
		liste.forEach((l, i) => {
			total += l.quantite * l.prixUnitaire;
			if (total > MONTANT_MAX) {
				ctx.addIssue({ code: 'custom', path: [i, 'prixUnitaire'], message: 'montant_invalide' });
			}
		});
	});

export const schemaFacture = z.object({
	tiersNom: z.string().trim().min(1, 'champ_requis').max(200, 'champ_requis'),
	tiersAdresse: z.string().trim().max(500, 'champ_requis').default(''),
	dateEmission: z
		.string()
		.nullable()
		.refine((d) => d === null || dateValide(d), 'date_invalide'),
	actionId: z.number().int().positive().nullable(),
	lignes
});

/** L'aperçu suit la frappe : il montre ce qui est saisi, même sans tiers encore. */
export const schemaApercuFacture = schemaFacture.extend({
	tiersNom: z.string().trim().max(200, 'champ_requis')
});
