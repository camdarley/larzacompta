import { dateValide } from '#lib/domaine/dates.ts';
import { peut } from '#lib/domaine/droits.ts';
import { application } from '#lib/server/composition.ts';
import { accesRequis, exiger } from '#lib/server/http.ts';

export function load({ locals, url }) {
	const app = application();
	const acces = accesRequis(locals.acces);
	const q = url.searchParams;
	const date = (nom: string) => {
		const d = q.get(nom);
		return d && dateValide(d) ? d : undefined;
	};
	const filtres = {
		personne: q.get('personne') || undefined,
		type: q.get('type') || undefined,
		du: date('du'),
		au: date('au')
	};
	const page = Math.max(1, Number(q.get('page')) || 1);
	return {
		filtres,
		journal: exiger(app.journal.lister(app.ctx(acces), filtres, page)),
		liensReglages: peut(acces.role, 'parametrer')
	};
}
