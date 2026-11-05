import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const reperes = exiger(app.exercices.lister(ctx)).map(({ id, libelle }) => ({ id, libelle }));
	return { etat: exercice ? exiger(app.etats.actions(ctx, exercice)) : null, reperes };
}
