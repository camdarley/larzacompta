import { redirect } from '@sveltejs/kit';
import { messageErreur } from '#lib/messages.ts';
import { schemaInvitation } from '#lib/schemas/acces.ts';
import { valider } from '#lib/schemas/valider.ts';
import { application } from '#lib/server/composition.ts';
import { poserCookieSession, poserCookieTheme } from '#lib/server/cookies.ts';
import { champsDe, refus } from '#lib/server/http.ts';

export function load({ params }) {
	const app = application();
	const invitation = app.acces.lireInvitation(app.ctx(null), params.jeton);
	return invitation.ok
		? { invitation: invitation.valeur, refus: null }
		: { invitation: null, refus: messageErreur(invitation.erreur) };
}

export const actions = {
	default: async ({ request, cookies, params }) => {
		const champs = champsDe(await request.formData());
		const saisie = { identifiant: champs.identifiant, nomAffiche: champs.nomAffiche };

		const entree = valider(schemaInvitation, {
			motDePasse: champs.motDePasse ?? '',
			identifiant: champs.identifiant || undefined,
			nomAffiche: champs.nomAffiche || undefined
		});
		if (!entree.ok) return refus(entree.erreur, saisie);

		const app = application();
		const r = await app.acces.accepterInvitation(app.ctx(null), {
			...entree.valeur,
			jeton: params.jeton
		});
		if (!r.ok) return refus(r.erreur, saisie);

		poserCookieSession(cookies, r.valeur.jeton, r.valeur.expireLe);
		poserCookieTheme(cookies, r.valeur.acces.preferences.theme);
		redirect(303, r.valeur.type === 'initial' ? '/bienvenue' : '/');
	}
};
