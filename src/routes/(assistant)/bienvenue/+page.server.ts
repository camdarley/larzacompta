import { redirect } from '@sveltejs/kit';
import { ETAPE_ASSISTANT_SOMMES, ETAPE_ASSISTANT_TERMINE } from '#lib/domaine/assistant.ts';
import { dateDeReprise } from '#lib/domaine/creances/index.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import { ACTIONS_TYPE, NATURES_TYPE } from '#lib/domaine/liste-type.ts';
import { fonctionLivree } from '#lib/fonctions.ts';
import { schemaLigneCompte } from '#lib/schemas/assistant.ts';
import { schemaReprise } from '#lib/schemas/creances.ts';
import { schemaAnnee } from '#lib/schemas/exercices.ts';
import { schemaAssociation } from '#lib/schemas/parametrage.ts';
import { valider } from '#lib/schemas/valider.ts';
import type { CompteDeDepart } from '#lib/server/application/exercices/index.ts';
import { application } from '#lib/server/composition.ts';
import { champsDe, exiger, refus } from '#lib/server/http.ts';

export function load({ locals, url }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const association = app.parametrage.association();
	const atteinte = association?.etapeAssistant ?? 1;

	const demande = url.searchParams.get('etape');
	const termine = atteinte >= ETAPE_ASSISTANT_TERMINE;
	const fin = demande === 'fin' && termine;
	const numero = Number(demande);
	const etape = fin
		? 'fin'
		: numero >= 1 && numero <= Math.min(atteinte, ETAPE_ASSISTANT_SOMMES)
			? numero
			: termine
				? 'fin'
				: Math.min(atteinte, ETAPE_ASSISTANT_SOMMES);

	const mois = association?.moisDebutExercice ?? 9;
	const exercices = exiger(app.exercices.lister(ctx));
	const reprise = dateDeReprise(exercices);
	return {
		association,
		atteinte,
		etape,
		anneeCourante: app.exercices.anneeCourante(ctx, mois),
		mois,
		comptes: exiger(app.parametrage.comptes(ctx)),
		exercices,
		dateReprise: reprise,
		sommes: reprise ? exiger(app.creances.reprises(ctx, reprise)) : [],
		actions: exiger(app.parametrage.actions(ctx)).map(({ id, libelle }) => ({ id, libelle })),
		naturesExistantes: exiger(app.parametrage.natures(ctx)).map((n) => n.libelle),
		actionsExistantes: exiger(app.parametrage.actions(ctx)).map((a) => a.libelle),
		naturesType: NATURES_TYPE,
		actionsType: ACTIONS_TYPE,
		suites: {
			importer: fonctionLivree('pointage'),
			saisir: fonctionLivree('operations')
		}
	};
}

/** Lignes `libelle-0`, `type-0`, `solde-0`… du formulaire de l'étape Vos Comptes. */
function lireComptes(champs: Record<string, string>): Resultat<CompteDeDepart[]> {
	const indices = Object.keys(champs)
		.flatMap((n) => /^libelle-(\d+)$/.exec(n)?.[1] ?? [])
		.sort((a, b) => Number(a) - Number(b));
	const comptes: CompteDeDepart[] = [];
	const erreurs: Record<string, string> = {};
	for (const i of indices) {
		const libelle = champs[`libelle-${i}`] ?? '';
		// Une rangée laissée vide n'est pas un Compte.
		if (libelle.trim() === '' && !champs[`solde-${i}`]?.trim()) continue;
		// Un solde vide n'est pas un zéro : 0 se tape, sinon le contrôle partirait d'un chiffre faux.
		if (!champs[`solde-${i}`]?.trim()) erreurs[`solde-${i}`] = 'solde_depart_requis';
		const r = valider(schemaLigneCompte, {
			id: champs[`id-${i}`] || undefined,
			libelle,
			type: champs[`type-${i}`],
			solde: champs[`solde-${i}`]
		});
		if (r.ok) {
			comptes.push(r.valeur);
		} else {
			const details = r.erreur.details?.champs as Record<string, string>;
			for (const [nom, code] of Object.entries(details)) erreurs[`${nom}-${i}`] = code;
		}
	}
	if (Object.keys(erreurs).length > 0) return echec('saisie_invalide', { champs: erreurs });
	return succes(comptes);
}

export const actions = {
	association: async ({ request, locals }) => {
		const champs = champsDe(await request.formData());
		const entree = valider(schemaAssociation, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		const app = application();
		const ctx = app.ctx(locals.acces);
		const r = app.parametrage.enregistrerAssociation(ctx, entree.valeur);
		if (!r.ok) return refus(r.erreur, champs);
		redirect(303, '/bienvenue?etape=2');
	},
	comptes: async ({ request, locals }) => {
		const champs = champsDe(await request.formData());
		const annee = valider(schemaAnnee, champs);
		if (!annee.ok) return refus(annee.erreur, champs);
		const comptes = lireComptes(champs);
		if (!comptes.ok) return refus(comptes.erreur, champs);
		if (comptes.valeur.length === 0) {
			return refus(
				{ code: 'saisie_invalide', details: { champs: { 'libelle-0': 'champ_requis' } } },
				champs
			);
		}
		const app = application();
		const r = app.exercices.demarrer(app.ctx(locals.acces), {
			anneeDebut: annee.valeur.anneeDebut,
			comptes: comptes.valeur
		});
		if (!r.ok) return refus(r.erreur, champs);
		redirect(303, '/bienvenue?etape=3');
	},
	liste: async ({ request, locals }) => {
		const formulaire = await request.formData();
		const textes = (nom: string) => formulaire.getAll(nom).filter((v) => typeof v === 'string');
		const app = application();
		const ctx = app.ctx(locals.acces);
		const r = app.parametrage.appliquerListeType(ctx, {
			natures: textes('nature'),
			actions: textes('action')
		});
		if (!r.ok) return refus(r.erreur);
		exiger(app.parametrage.definirEtapeAssistant(ctx, ETAPE_ASSISTANT_SOMMES));
		redirect(303, `/bienvenue?etape=${ETAPE_ASSISTANT_SOMMES}`);
	},
	/** Une somme reprise reste sur l'écran : on en ajoute une autre, ou on termine. */
	somme: async ({ request, locals }) => {
		const champs = champsDe(await request.formData());
		const entree = valider(schemaReprise, champs);
		if (!entree.ok) return refus(entree.erreur, champs);
		const app = application();
		const ctx = app.ctx(locals.acces);
		const date = dateDeReprise(exiger(app.exercices.lister(ctx)));
		if (date === null) return refus({ code: 'exercice_invalide' }, champs);
		const r = app.creances.ajouter(ctx, { ...entree.valeur, date, note: null });
		if (!r.ok) return refus(r.erreur, champs);
		return { ajoutee: true };
	},
	terminer: ({ locals }) => {
		const app = application();
		exiger(app.parametrage.definirEtapeAssistant(app.ctx(locals.acces), ETAPE_ASSISTANT_TERMINE));
		redirect(303, '/bienvenue?etape=fin');
	}
};
