import { error } from '@sveltejs/kit';
import { peut } from '#lib/domaine/droits.ts';
import { exerciceSelectionne } from '#lib/domaine/exercices.ts';
import { entreesMobile, fonctionLivree, navigation } from '#lib/fonctions.ts';
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

	// Le panneau Opération vit dans l'URL : recharger ou partager rouvre le même état (AD-19).
	const parametre = url.searchParams.get('op');
	const ctx = app.ctx(acces);
	const lireDetail = (id: string | null) => {
		if (id === null) return null;
		const r = app.operations.detail(ctx, Number(id));
		return r.ok ? r.valeur : null;
	};
	const detail = parametre === 'nouvelle' ? null : lireDetail(parametre);
	const lireLigne = (id: string | null) => {
		if (id === null) return null;
		const r = app.pointage.ligneASaisir(ctx, Number(id));
		return r.ok ? r.valeur : null;
	};
	const lireSomme = (id: string | null) => {
		if (id === null) return null;
		const r = app.creances.aSolder(ctx, Number(id));
		return r.ok ? r.valeur : null;
	};
	const lireSommes = (voulues: boolean) => {
		const r = voulues ? app.creances.ouvertes(ctx) : null;
		return r?.ok ? r.valeur : [];
	};
	const panneau =
		parametre === null ||
		!peut(acces.role, 'consulter') ||
		// Sans droit d'écriture, « nouvelle » n'ouvre rien : la page reste calme.
		(parametre === 'nouvelle' && !peut(acces.role, 'saisir'))
			? null
			: {
					contexte: exiger(app.operations.contexteSaisie(ctx)),
					detail,
					modele: lireDetail(url.searchParams.get('depuis') ?? url.searchParams.get('rendre')),
					ligne: lireLigne(url.searchParams.get('releve')),
					solder: lireSomme(url.searchParams.get('solder')),
					sommes: lireSommes(parametre === 'nouvelle' && url.searchParams.has('solder')),
					introuvable: parametre !== 'nouvelle' && detail === null
				};

	const exercice = exerciceSelectionne(exercices, url.searchParams.get('exercice'));

	return {
		acces: {
			nomAffiche: acces.nomAffiche,
			role: acces.role,
			identifiant: acces.identifiant
		},
		peutSaisir: peut(acces.role, 'saisir'),
		compteurs: {
			pointage:
				fonctionLivree('pointage') && peut(acces.role, 'saisir')
					? exiger(app.pointage.aPointer(ctx))
					: 0,
			pieces:
				fonctionLivree('pieces') && peut(acces.role, 'saisir')
					? exiger(app.pieces.compterManquantes(ctx, exercice))
					: 0
		},
		raccourcis: acces.preferences.raccourcis,
		panneau,
		theme: acces.preferences.theme,
		nav: navigation(acces.role),
		entreesMobile: entreesMobile(acces.role),
		exercices: [...exercices].sort((a, b) => b.anneeDebut - a.anneeDebut),
		exercice
	};
}
