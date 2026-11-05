import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

export async function POST({ locals, params }) {
	const app = application();
	return reponseJson(await app.factures.valider(app.ctx(locals.acces), Number(params.id)));
}
