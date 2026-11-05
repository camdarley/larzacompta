import { error } from '@sveltejs/kit';
import { message } from '#lib/messages.ts';
import type { TypeEtat } from '#lib/server/application/etats/index.ts';
import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

const ETATS: readonly (TypeEtat | 'budget')[] = [
	'compte-de-resultat',
	'tresorerie',
	'actions',
	'action',
	'budget'
];

function introuvable(): never {
	error(404, { code: 'element_introuvable', message: message('element_introuvable') });
}

/** Menu Exporter : l'état affiché, pour l'Exercice regardé, en PDF ou XLSX (FR-35). */
export async function GET({ locals, url }) {
	const etat = url.searchParams.get('etat') as TypeEtat | 'budget' | null;
	const format = url.searchParams.get('format');
	if (etat === null || !ETATS.includes(etat) || (format !== 'pdf' && format !== 'xlsx')) {
		introuvable();
	}
	const app = application();
	const ctx = app.ctx(locals.acces);
	const exercice = exiger(app.exercices.selection(ctx, url.searchParams.get('exercice')));
	if (exercice === null) introuvable();
	const id = Number(url.searchParams.get('id')) || null;
	const comparer = url.searchParams.get('comparer');
	// Le Budget garde son droit : la route est ouverte à la lecture, pas lui.
	const modele = exiger(
		etat === 'budget'
			? app.budget.modele(ctx, exercice)
			: app.etats.modele(ctx, etat, exercice, id, comparer)
	);
	const octets = await app.socle.exporteurs[format](modele);
	return reponseFichier(octets, {
		mime: MIME[format],
		nom: `${modele.nomFichier}.${format}`,
		type: 'attachment'
	});
}
