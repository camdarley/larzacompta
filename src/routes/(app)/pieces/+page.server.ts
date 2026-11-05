import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return {
		manquantes: exiger(app.pieces.manquantes(ctx, exercice)),
		existantes: exiger(app.pieces.lister(ctx, {}, 1)).existantes
	};
}
