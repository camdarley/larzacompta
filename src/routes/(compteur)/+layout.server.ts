import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import { accesRequis } from '#lib/server/http.ts';

/** Écrans du Comptage : ni barre, ni sélecteur d'Exercice, pour la trésorerie aussi. */
export function load({ locals }) {
	if (locals.refuse) error(403, { code: 'acces_refuse', message: message('acces_refuse') });
	const acces = accesRequis(locals.acces);
	return {
		acces: { nomAffiche: acces.nomAffiche, role: acces.role, identifiant: acces.identifiant },
		theme: acces.preferences.theme
	};
}
