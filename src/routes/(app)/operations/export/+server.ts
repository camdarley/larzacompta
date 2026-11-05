import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';
import { filtresDepuisUrl } from '../filtres.ts';
import { exerciceSelectionne } from '#lib/domaine/exercices.ts';

/** Le résultat affiché, rien de plus : mêmes filtres, même Exercice. */
export function GET({ url, locals }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const exercices = exiger(app.exercices.lister(ctx));
	const exercice = exerciceSelectionne(exercices, url.searchParams.get('exercice'));
	const csv = exiger(app.operations.exporter(ctx, filtresDepuisUrl(url, exercice).recherche));
	const nom = `operations-${exercice?.libelle ?? 'export'}.csv`;
	return reponseFichier(new TextEncoder().encode(csv), {
		mime: MIME.csv,
		nom,
		type: 'attachment'
	});
}
