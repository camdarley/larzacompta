import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

/** Annuler du `toast` qui suit une création à la volée. */
export function POST({ locals, params }) {
	const app = application();
	return reponseJson(app.parametrage.supprimerAction(app.ctx(locals.acces), Number(params.id)));
}
