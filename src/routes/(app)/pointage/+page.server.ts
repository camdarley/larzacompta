import { redirect } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';

/** `/pointage` mène au premier Compte qui se pointe. */
export async function load({ locals, url, parent }) {
	await parent();
	const app = application();
	const [compte] = exiger(app.pointage.comptes(app.ctx(locals.acces)));
	if (compte) redirect(307, `/pointage/${compte.id}${url.search}`);
	return {};
}
