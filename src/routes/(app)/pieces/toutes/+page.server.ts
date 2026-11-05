import type { FiltresPieces } from '#lib/domaine/pieces/index.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export async function load({ locals, url, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const q = url.searchParams;
	const type = q.get('type');
	const etat = q.get('etat');
	const filtres: FiltresPieces = {
		texte: q.get('q') ?? undefined,
		type: type === 'image' || type === 'pdf' ? type : undefined,
		etat: etat === 'rattachee' || etat === 'en_attente' ? etat : undefined
	};
	const page = Math.max(1, Number(q.get('page')) || 1);
	const choisie = Number(q.get('piece'));
	const lue = choisie > 0 ? app.pieces.parId(ctx, choisie) : null;
	return {
		filtres: { q: q.get('q') ?? '', type: filtres.type ?? '', etat: filtres.etat ?? '' },
		resultat: exiger(app.pieces.lister(ctx, filtres, page)),
		manquantes: exiger(app.pieces.compterManquantes(ctx, exercice)),
		choisie: lue?.ok ? lue.valeur : null
	};
}
