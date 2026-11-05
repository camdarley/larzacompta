import { peut } from '#lib/domaine/droits.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent, params }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const id = Number(params.id);
	// Un·e lecteur·rice ne voit ici ni Budget ni Sessions (story 11.1) : rien ne part vers sa page.
	const complet = peut(ctx.acces?.role ?? 'lecteur', 'saisir');
	return {
		id,
		budget: exercice && complet ? exiger(app.budget.action(ctx, exercice, id)) : null,
		fiche: exercice ? exiger(app.etats.action(ctx, exercice, id)) : null,
		sessions: exercice && complet ? exiger(app.caisses.sessionsDeLAction(ctx, id, exercice)) : []
	};
}
