import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { ETAPE_ASSISTANT_TERMINE } from '#lib/domaine/assistant.ts';
import { peut } from '#lib/domaine/droits.ts';
import { fonctionLivree } from '#lib/fonctions.ts';

export async function load({ locals, parent }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const { exercice } = await parent();
	const association = app.parametrage.association();
	const pret = (association?.etapeAssistant ?? 0) >= ETAPE_ASSISTANT_TERMINE && exercice !== null;
	const pointage =
		fonctionLivree('pointage') && locals.acces !== null && peut(locals.acces.role, 'saisir');
	const j = pret && pointage ? exiger(app.operations.journal(ctx)) : null;
	return {
		pointage,
		premierReleve: j !== null && j.lignesReleve.length === 0,
		pret,
		soldes: pret && exercice ? exiger(app.operations.soldes(ctx, exercice)) : []
	};
}
