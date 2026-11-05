import { redirect } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals }) {
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const vue = exiger(app.cheques.nouvelleRemise(ctx));
	if (vue.cheques.length === 0) redirect(303, '/cheques/remises');
	const contexte = exiger(app.operations.contexteSaisie(ctx));
	const ouvert = contexte.exercices.filter((e) => e.statut === 'ouvert').at(-1) ?? null;
	return { vue, date: app.operations.dateParDefaut(ctx, ouvert) };
}
