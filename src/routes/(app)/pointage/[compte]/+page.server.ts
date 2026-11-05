import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

export async function load({ locals, params, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(locals.acces);
	const r = app.pointage.page(ctx, Number(params.compte), exercice?.debut ?? null);
	if (!r.ok && r.erreur.code === 'element_introuvable') {
		error(404, { code: 'element_introuvable', message: message('element_introuvable') });
	}
	return { pointage: exiger(r), aujourdhui: ctx.aujourdhui };
}
