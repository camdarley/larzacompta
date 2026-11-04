import { error } from '@sveltejs/kit';
import { exerciceSelectionne } from '#lib/domaine/exercices.ts';
import { entreesMobile, navigation } from '#lib/fonctions.ts';
import { message } from '#lib/messages.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, url }) {
	// Rendu calme du refus décidé par hooks.server.ts : ce n'est pas ici que le contrôle se fait.
	if (locals.refuse) error(403, { code: 'acces_refuse', message: message('acces_refuse') });

	const acces = accesRequis(locals.acces);
	const app = application();
	const exercices = exiger(app.exercices.lister(app.ctx(acces))).filter(
		(e) => e.statut !== 'repere'
	);
	return {
		acces: { nomAffiche: acces.nomAffiche, role: acces.role },
		theme: acces.preferences.theme,
		nav: navigation(acces.role),
		entreesMobile: entreesMobile(acces.role),
		exercices: [...exercices].sort((a, b) => b.anneeDebut - a.anneeDebut),
		exercice: exerciceSelectionne(exercices, url.searchParams.get('exercice'))
	};
}
