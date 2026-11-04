import type { z } from 'zod';
import type { Resultat } from '#lib/domaine/resultat.ts';
import { valider } from '#lib/schemas/valider.ts';
import type { Ctx } from './application/executer.ts';
import { application, type Application } from './composition.ts';
import { champsDe, refus } from './http.ts';

type Evenement = { request: Request; locals: App.Locals };

/** Forme commune d'une action de formulaire : schéma, cas d'usage, saisie conservée en cas d'échec. */
export function action<S extends z.ZodType, T>(
	schema: S,
	faire: (app: Application, ctx: Ctx, entree: z.output<S>) => Resultat<T>
) {
	return async ({ request, locals }: Evenement) => {
		const champs = champsDe(await request.formData());
		const entree = valider(schema, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		const app = application();
		const r = faire(app, app.ctx(locals.acces), entree.valeur);
		return r.ok ? { reussi: true as const, valeur: r.valeur } : refus(r.erreur, champs);
	};
}
