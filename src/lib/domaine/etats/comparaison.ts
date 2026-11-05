/**
 * Comparaison du Compte de résultat entre Exercices (FR-34). Une Action n'existe qu'une fois,
 * d'une année à l'autre : son identité suffit, même renommée. Chaque Exercice garde son calcul,
 * avec son paramétrage figé s'il est clôturé (AD-5). Ici, on ne fait que rapprocher.
 */
import type { Exercice } from '../exercices.ts';
import { centimes } from '../montant.ts';
import { noeudAction, noeudNature, type Noeud, type TypeRangee } from './arbre.ts';
import type { CompteDeResultat, NoeudAction, NoeudGroupe, NoeudNature } from './resultat.ts';

export type ColonneComparee = { exerciceId: number; libelle: string };

export type Comparaison = {
	colonnes: ColonneComparee[];
	noeuds: Noeud[];
	/** Dernière rangée : le résultat de chaque Exercice. */
	total: Noeud;
};

/** Ce qu'une année a réellement porté : un Groupe sans Ligne en est absent. */
type Annee = {
	groupes: Map<number, NoeudGroupe>;
	actions: Map<number, { groupeId: number; noeud: NoeudAction }>;
	natures: Map<number, { groupeId: number; noeud: NoeudNature }>;
};

function indexer(cr: CompteDeResultat): Annee {
	const annee: Annee = { groupes: new Map(), actions: new Map(), natures: new Map() };
	for (const g of cr.groupes) {
		if (g.actions.length + g.sansAction.length === 0) continue;
		annee.groupes.set(g.groupeId, g);
		for (const a of g.actions) annee.actions.set(a.actionId, { groupeId: g.groupeId, noeud: a });
		for (const n of g.sansAction) {
			annee.natures.set(n.natureId, { groupeId: g.groupeId, noeud: n });
		}
	}
	return annee;
}

const vide = (cle: string, type: TypeRangee, libelle: string): Noeud => ({
	cle,
	type,
	libelle,
	recettes: centimes(0),
	depenses: centimes(0),
	resultat: centimes(0),
	absent: true,
	enfants: []
});

const parLibelle = (a: Noeud, b: Noeud) => a.libelle.localeCompare(b.libelle, 'fr');

const unionDe = <T>(listes: readonly (readonly T[])[]) => [...new Set(listes.flat())];

/** Une Nature d'une Action : la même Nature, sous la même Action, d'une année à l'autre. */
function natureAction(
	actionId: number,
	natureId: number,
	ici: NoeudAction | undefined,
	compares: readonly (NoeudAction | undefined)[]
): Noeud {
	const parent = `a${actionId}`;
	const lue = (a?: NoeudAction) => a?.natures.find((n) => n.natureId === natureId);
	const courante = lue(ici);
	const lues = compares.map(lue);
	const base = courante
		? noeudNature(courante, parent)
		: vide(
				`${parent}-n${natureId}`,
				'nature',
				lues.find((n) => n !== undefined)?.libelle as string
			);
	return { ...base, comparaisons: lues.map((n) => n?.resultat ?? null) };
}

function action(id: number, ici: Annee, annees: readonly Annee[]): Noeud {
	const courante = ici.actions.get(id)?.noeud;
	const comparees = annees.map((a) => a.actions.get(id)?.noeud);
	const base = courante
		? noeudAction(courante)
		: {
				...vide(`a${id}`, 'action', comparees.find((a) => a !== undefined)?.libelle as string),
				actionId: id
			};
	const natureIds = unionDe(
		[courante, ...comparees].map((a) => a?.natures.map((n) => n.natureId) ?? [])
	);
	return {
		...base,
		comparaisons: comparees.map((a) => a?.resultat ?? null),
		enfants: natureIds.map((n) => natureAction(id, n, courante, comparees)).sort(parLibelle)
	};
}

function natureSansAction(
	id: number,
	groupeId: number,
	ici: Annee,
	annees: readonly Annee[]
): Noeud {
	const parent = `g${groupeId}`;
	const courante = ici.natures.get(id)?.noeud;
	const comparees = annees.map((a) => a.natures.get(id)?.noeud);
	const base = courante
		? noeudNature(courante, parent)
		: vide(`${parent}-n${id}`, 'nature', comparees.find((n) => n !== undefined)?.libelle as string);
	return { ...base, comparaisons: comparees.map((n) => n?.resultat ?? null) };
}

/** Une place par identité : l'Exercice regardé d'abord, puis le plus récent qui la connaît. */
function placer<T>(
	annees: readonly Annee[],
	lire: (a: Annee) => Map<number, T & { groupeId: number }>
): Map<number, number> {
	const place = new Map<number, number>();
	for (const a of annees) {
		for (const [id, { groupeId }] of lire(a)) {
			if (!place.has(id)) place.set(id, groupeId);
		}
	}
	return place;
}

const idsDans = (place: ReadonlyMap<number, number>, groupeId: number) =>
	[...place].filter(([, g]) => g === groupeId).map(([id]) => id);

export function comparerResultats(
	courant: CompteDeResultat,
	compares: readonly { exercice: Pick<Exercice, 'id' | 'libelle'>; resultat: CompteDeResultat }[]
): Comparaison {
	const ici = indexer(courant);
	const annees = compares.map((c) => indexer(c.resultat));
	const toutes = [ici, ...annees];
	const actions = placer(toutes, (a) => a.actions);
	const natures = placer(toutes, (a) => a.natures);
	const groupes = unionDe([
		courant.groupes.map((g) => g.groupeId),
		...compares.map((c) => c.resultat.groupes.map((g) => g.groupeId))
	]).filter((id) => toutes.some((a) => a.groupes.has(id)));

	const noeuds = groupes.map((id): Noeud => {
		const moi = ici.groupes.get(id);
		const lus = annees.map((a) => a.groupes.get(id));
		const cle = `g${id}`;
		const libelle = (moi ?? lus.find((g) => g !== undefined))?.libelle as string;
		const enfantsActions = idsDans(actions, id)
			.map((a) => action(a, ici, annees))
			.sort(parLibelle);
		const enfantsNatures = idsDans(natures, id)
			.map((n) => natureSansAction(n, id, ici, annees))
			.sort(parLibelle);
		const totaux = moi
			? { recettes: moi.recettes, depenses: moi.depenses, resultat: moi.resultat }
			: { recettes: centimes(0), depenses: centimes(0), resultat: centimes(0), absent: true };
		return {
			cle,
			type: 'groupe',
			libelle,
			...totaux,
			comparaisons: lus.map((g) => g?.resultat ?? null),
			enfants: [...enfantsActions, ...enfantsNatures]
		};
	});

	return {
		colonnes: compares.map((c) => ({ exerciceId: c.exercice.id, libelle: c.exercice.libelle })),
		noeuds,
		total: {
			cle: 'total',
			type: 'section',
			libelle: 'Résultat de l’Exercice',
			recettes: courant.recettes,
			depenses: courant.depenses,
			resultat: courant.resultat,
			comparaisons: compares.map((c) => c.resultat.resultat),
			enfants: []
		}
	};
}

/** Exercices proposés par « Comparer à » : tenus, sans celui regardé, le plus récent d'abord. */
export function exercicesComparables(exercices: readonly Exercice[], e: Exercice): Exercice[] {
	return exercices
		.filter((x) => x.statut !== 'repere' && x.id !== e.id)
		.sort((a, b) => b.anneeDebut - a.anneeDebut);
}

/** `?comparer=2025-2026,2024-2025` : ce que l'URL demande, sans rien d'inconnu. */
export function exercicesCompares(
	exercices: readonly Exercice[],
	e: Exercice,
	valeur: string | null
): Exercice[] {
	const demandes = new Set((valeur ?? '').split(','));
	return exercicesComparables(exercices, e).filter((x) => demandes.has(x.libelle));
}

/** Valeur de `?comparer=` une fois `libelle` coché ou décoché. `null` : plus rien à comparer. */
export function basculerComparaison(
	choisis: readonly Pick<Exercice, 'libelle'>[],
	libelle: string
): string | null {
	const libelles = choisis.map((c) => c.libelle);
	const suite = libelles.includes(libelle)
		? libelles.filter((l) => l !== libelle)
		: [...libelles, libelle];
	return suite.length === 0 ? null : suite.join(',');
}
