import { peut } from '#lib/domaine/droits.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, parent, params }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const id = Number(params.id);
	return {
		id,
		peutConsulterCaisses: peut(ctx.acces?.role ?? 'lecteur', 'consulter_suivi'),
		fiche: exercice ? exiger(app.etats.action(ctx, exercice, id)) : null,
		sessions: exercice ? exiger(app.caisses.sessionsDeLAction(ctx, id, exercice)) : []
	};
}
