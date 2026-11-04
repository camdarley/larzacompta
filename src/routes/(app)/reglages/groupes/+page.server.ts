import {
	schemaDeplacement,
	schemaGroupe,
	schemaGroupeExistant,
	schemaId
} from '#lib/schemas/parametrage.ts';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	return { groupes: exiger(app.parametrage.groupes(app.ctx(locals.acces))) };
}

export const actions = {
	creer: action(schemaGroupe, (app, ctx, e) => app.parametrage.creerGroupe(ctx, e.libelle)),
	modifier: action(schemaGroupeExistant, (app, ctx, e) =>
		app.parametrage.renommerGroupe(ctx, e.id, e.libelle)
	),
	deplacer: action(schemaDeplacement, (app, ctx, e) =>
		app.parametrage.deplacerGroupe(ctx, e.id, e.sens)
	),
	supprimer: action(schemaId, (app, ctx, e) => app.parametrage.supprimerGroupe(ctx, e.id))
};
