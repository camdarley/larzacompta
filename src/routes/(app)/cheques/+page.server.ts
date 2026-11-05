import { peut } from '#lib/domaine/droits.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, url }) {
	const app = application();
	const acces = accesRequis(locals.acces);
	const ctx = app.ctx(acces);
	const saisir = peut(acces.role, 'saisir');
	const parametre = url.searchParams.get('cheque');
	const id = Number(parametre);
	const fiche = parametre !== null && id > 0 ? app.cheques.fiche(ctx, id) : null;
	return {
		vue: exiger(app.cheques.recus(ctx)),
		saisie: saisir ? exiger(app.operations.contexteSaisie(ctx)) : null,
		fiche: fiche?.ok ? fiche.valeur : null
	};
}
