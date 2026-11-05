import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const natures = exiger(app.operations.contexteSaisie(ctx)).natures;
	const neutre = natures.find((n) => n.neutre);
	return {
		etat: exercice ? exiger(app.etats.tresorerie(ctx, exercice)) : null,
		natureNeutre: neutre?.id ?? null
	};
}
