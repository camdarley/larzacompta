import { z } from 'zod';
import { echec, succes } from '#lib/domaine/resultat.ts';
import {
	schemaActivation,
	schemaCompte,
	schemaCompteExistant,
	schemaDeplacement,
	schemaId
} from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	return {
		comptes: exiger(app.parametrage.comptes(ctx)),
		ouverts: exiger(app.exercices.lister(ctx)).filter((e) => e.statut === 'ouvert')
	};
}

function ancreDe(e: z.output<typeof schemaCompte>) {
	return e.exerciceId ? { exerciceId: e.exerciceId, solde: e.soldeDepart } : undefined;
}

export const actions = {
	creer: action(schemaCompte, (app, ctx, e) =>
		app.parametrage.creerCompte(ctx, {
			libelle: e.libelle,
			type: e.type,
			reserve: e.reserve,
			ancre: ancreDe(e)
		})
	),
	modifier: action(schemaCompteExistant, (app, ctx, e) =>
		app.parametrage.modifierCompte(ctx, {
			id: e.id,
			libelle: e.libelle,
			type: e.type,
			reserve: e.reserve,
			ancre: ancreDe(e)
		})
	),
	activer: action(schemaActivation, (app, ctx, e) =>
		app.parametrage.activerCompte(ctx, e.id, e.actif)
	),
	supprimer: action(schemaId, (app, ctx, e) => {
		const r = app.parametrage.supprimerCompte(ctx, e.id);
		return r.ok ? succes(true) : echec(r.erreur.code);
	}),
	deplacer: action(schemaDeplacement, (app, ctx, e) =>
		app.parametrage.deplacerCompte(ctx, e.id, e.sens)
	)
};
