import { z } from 'zod';
import { action } from '#lib/server/action.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';
import { messageErreur } from '#lib/messages.ts';

export function load({ locals, params }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const r = exiger(app.exercices.recapitulatifCloture(ctx, Number(params.id)));
	return { ...r, refus: r.refus && messageErreur(r.refus) };
}

export const actions = {
	cloturer: action(z.object({ exerciceId: z.coerce.number().int().positive() }), (app, ctx, e) =>
		app.exercices.cloturer(ctx, e.exerciceId)
	)
};
