import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { ETAPE_ASSISTANT_TERMINE } from '#lib/domaine/assistant.ts';

export async function load({ locals, parent }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const { exercice } = await parent();
	const association = app.parametrage.association();
	const pret = (association?.etapeAssistant ?? 0) >= ETAPE_ASSISTANT_TERMINE && exercice !== null;
	return {
		pret,
		soldes: pret && exercice ? exiger(app.parametrage.soldesDepart(ctx, exercice.id)) : []
	};
}
