import { montantFacultatif } from '#lib/schemas/parametrage.ts';
import { schemaAnnee, schemaRepere } from '#lib/schemas/exercices.ts';
import { valider } from '#lib/schemas/valider.ts';
import { action } from '#lib/server/action.ts';
import type { SoldeCompte } from '#lib/server/application/exercices/index.ts';
import { application } from '#lib/server/composition.ts';
import { champsDe, exiger, refus } from '#lib/server/http.ts';
import { z } from 'zod';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const association = app.parametrage.association();
	return {
		exercices: exiger(app.exercices.lister(ctx)).sort((a, b) => b.anneeDebut - a.anneeDebut),
		comptes: exiger(app.parametrage.comptes(ctx)).filter((c) => c.actif),
		anneeCourante: app.exercices.anneeCourante(ctx, association?.moisDebutExercice ?? 9),
		moisDebut: association?.moisDebutExercice ?? 9
	};
}

/** Les champs `solde-<idCompte>` d'une Balance d'ouverture. */
function lireSoldes(champs: Record<string, string>): Resultat<SoldeCompte[]> {
	const soldes: SoldeCompte[] = [];
	const erreurs: Record<string, string> = {};
	for (const [nom, valeur] of Object.entries(champs)) {
		const m = /^solde-(\d+)$/.exec(nom);
		if (!m) continue;
		const lu = montantFacultatif.safeParse(valeur);
		if (lu.success) soldes.push({ compteId: Number(m[1]), solde: lu.data });
		else erreurs[nom] = 'montant_invalide';
	}
	return Object.keys(erreurs).length > 0
		? echec('saisie_invalide', { champs: erreurs })
		: succes(soldes);
}

export const actions = {
	premier: async ({ request, locals }) => {
		const champs = champsDe(await request.formData());
		const annee = valider(schemaAnnee, champs);
		if (!annee.ok) return refus(annee.erreur, champs);
		const soldes = lireSoldes(champs);
		if (!soldes.ok) return refus(soldes.erreur, champs);
		const app = application();
		const r = app.exercices.ouvrirPremier(app.ctx(locals.acces), {
			anneeDebut: annee.valeur.anneeDebut,
			soldes: soldes.valeur
		});
		return r.ok ? { reussi: true } : refus(r.erreur, champs);
	},
	suivant: action(z.object({}), (app, ctx) => app.exercices.ouvrirSuivant(ctx)),
	repere: action(schemaRepere, (app, ctx, e) => app.exercices.ajouterRepere(ctx, e.libelle)),
	balance: async ({ request, locals }) => {
		const champs = champsDe(await request.formData());
		const soldes = lireSoldes(champs);
		if (!soldes.ok) return refus(soldes.erreur, champs);
		const app = application();
		const r = app.exercices.enregistrerBalance(app.ctx(locals.acces), {
			exerciceId: Number(champs.exerciceId),
			soldes: soldes.valeur
		});
		return r.ok ? { reussi: true } : refus(r.erreur, champs);
	}
};
