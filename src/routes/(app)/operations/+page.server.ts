import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';
import { filtresDepuisUrl } from './filtres.ts';

export async function load({ locals, url, parent }) {
	const { exercice } = await parent();
	const app = application();
	const ctx = app.ctx(accesRequis(locals.acces));
	const filtres = filtresDepuisUrl(url, exercice);
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const contexte = exiger(app.operations.contexteSaisie(ctx));
	const resultats = exiger(app.operations.rechercher(ctx, filtres.recherche, page));
	const sansFiltre = Object.values(filtres.url).every((v) => !v);
	return {
		filtres: filtres.url,
		resultats,
		/** Rien dans cet Exercice, et rien de filtré : l'état vide d'accueil, pas « rien ne correspond ». */
		vide: sansFiltre && resultats.total === 0,
		comptes: contexte.comptes.map(({ id, libelle }) => ({ id, libelle })),
		natures: contexte.natures.map(({ id, libelle }) => ({ id, libelle })),
		actions: contexte.actions.map(({ id, libelle }) => ({ id, libelle }))
	};
}
