import { z } from 'zod';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	return { budget: exercice ? exiger(app.budget.ecran(ctx, exercice)) : null };
}

const schemaRepartir = z.object({ exerciceId: z.coerce.number().int().positive() });

export const actions = {
	repartir: action(schemaRepartir, (app, ctx, { exerciceId }) =>
		app.budget.repartir(ctx, exerciceId)
	)
};
