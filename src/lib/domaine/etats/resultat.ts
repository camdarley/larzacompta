/**
 * Compte de résultat, résultat par Action et équation de contrôle (SCHEMA-DONNEES §8, AD-4 à AD-6).
 * Une équation qui échoue renvoie une anomalie à afficher, jamais un chiffre silencieusement faux.
 */
import type { DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, LigneJ, OperationJ, PieceJ } from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import type { Action, Compte, Groupe, Nature } from '../parametrage.ts';
import { colonneDe, exerciceDuMouvement, groupeDe, soldeCompte, soldeDepart } from './soldes.ts';

/** Entrées du calcul : courantes, ou figées à la clôture (AD-5). Jamais un résultat. */
export type ParametrageEtats = {
	groupes: readonly Pick<Groupe, 'id' | 'libelle' | 'ordre'>[];
	natures: readonly Pick<Nature, 'id' | 'libelle' | 'groupeId' | 'neutre'>[];
	actions: readonly Pick<Action, 'id' | 'libelle' | 'groupeId'>[];
	comptes: readonly Pick<Compte, 'id' | 'libelle' | 'type' | 'ordre' | 'actif'>[];
};

export type Totaux = { recettes: Centimes; depenses: Centimes; resultat: Centimes };

export type LigneEtat = {
	id: number;
	operationId: number;
	date: DateCivile;
	libelle: string;
	montant: Centimes;
	estReduction: boolean;
	exerciceRattachementId: number;
	pieces: PieceJ[];
};

export type NoeudNature = Totaux & { natureId: number; libelle: string; lignes: LigneEtat[] };
export type NoeudAction = Totaux & { actionId: number; libelle: string; natures: NoeudNature[] };
/** Groupe d'un état : les Actions, puis les Lignes sans Action rangées par Nature. */
export type NoeudGroupe = Totaux & {
	groupeId: number;
	libelle: string;
	actions: NoeudAction[];
	sansAction: NoeudNature[];
};

export type BlocAnterieur = Totaux & { groupes: NoeudGroupe[] };

export type Anomalie =
	| { code: 'anomalie_equation'; details: { difference: Centimes } }
	| { code: 'anomalie_groupe'; details: { lignes: number } }
	| { code: 'anomalie_actions'; details: { difference: Centimes } };

export type CompteDeResultat = Totaux & {
	exerciceId: number;
	groupes: NoeudGroupe[];
	/** Lignes rattachées à un Exercice antérieur : hors résultat, jamais mêlées au bloc courant. */
	anterieurs: BlocAnterieur;
	/** Natures neutres de l'Exercice : hors des deux blocs, reprises par l'explication. */
	neutres: Centimes;
	anomalies: Anomalie[];
};

export type ResultatParAction = Totaux & {
	exerciceId: number;
	groupes: NoeudGroupe[];
	sansAction: NoeudNature[];
	sansActionTotaux: Totaux;
	anterieurs: BlocAnterieur;
	anomalies: Anomalie[];
};

/** Groupe et Nature de repli : une Ligne orpheline reste visible et compte, avec son anomalie. */
const INCONNU = -1;
const LIBELLE_INCONNU = 'Non rangé';

export function totauxDe(lignes: readonly Pick<LigneJ, 'montant' | 'estReduction'>[]): Totaux {
	const dans = (colonne: 'recette' | 'depense') =>
		sommeCentimes(lignes.filter((l) => colonneDe(l) === colonne).map((l) => l.montant));
	const recettes = dans('recette');
	const depenses = centimes(0 - dans('depense'));
	return { recettes, depenses, resultat: centimes(recettes - depenses) };
}

function additionner(noeuds: readonly Totaux[]): Totaux {
	const somme = (cle: keyof Totaux) => sommeCentimes(noeuds.map((n) => n[cle]));
	return { recettes: somme('recettes'), depenses: somme('depenses'), resultat: somme('resultat') };
}

const parLibelle = (a: { libelle: string }, b: { libelle: string }) =>
	a.libelle.localeCompare(b.libelle, 'fr');

function grouper<T, K>(elements: readonly T[], cle: (x: T) => K): Map<K, T[]> {
	const paquets = new Map<K, T[]>();
	for (const x of elements) paquets.set(cle(x), [...(paquets.get(cle(x)) ?? []), x]);
	return paquets;
}

type LigneRangee = LigneEtat & { natureId: number; actionId: number | null };

function noeudsNature(lignes: readonly LigneRangee[], p: ParametrageEtats): NoeudNature[] {
	return [...grouper(lignes, (l) => l.natureId)]
		.map(([natureId, dela]) => ({
			natureId,
			libelle: p.natures.find((n) => n.id === natureId)?.libelle ?? LIBELLE_INCONNU,
			...totauxDe(dela),
			lignes: [...dela].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
		}))
		.sort(parLibelle);
}

function noeudGroupe(
	groupeId: number,
	libelle: string,
	lignes: readonly LigneRangee[],
	p: ParametrageEtats
): NoeudGroupe {
	const avecAction = lignes.filter((l) => l.actionId !== null);
	const actions = [...grouper(avecAction, (l) => l.actionId as number)]
		.map(([actionId, dela]) => ({
			actionId,
			libelle: p.actions.find((a) => a.id === actionId)?.libelle ?? LIBELLE_INCONNU,
			...totauxDe(dela),
			natures: noeudsNature(dela, p)
		}))
		.sort(parLibelle);
	const sansAction = noeudsNature(
		lignes.filter((l) => l.actionId === null),
		p
	);
	return { groupeId, libelle, ...totauxDe(lignes), actions, sansAction };
}

function vueLigne(l: LigneJ, op: OperationJ): LigneRangee {
	return {
		id: l.id,
		operationId: op.id,
		date: op.date,
		libelle: op.libelle,
		montant: l.montant,
		estReduction: l.estReduction,
		exerciceRattachementId: l.exerciceRattachementId,
		pieces: op.pieces,
		natureId: l.natureId,
		actionId: l.actionId
	};
}

/** Tous les Groupes, dans leur ordre : d'une année à l'autre, le document garde sa forme (FR-33). */
function arbre(
	lignes: readonly LigneRangee[],
	p: ParametrageEtats,
	tous: boolean
): { groupes: NoeudGroupe[]; orphelines: number } {
	const parGroupe = grouper(lignes, (l) => groupeDe(l, p) ?? INCONNU);
	const connus = new Set(p.groupes.map((g) => g.id));
	const orphelines = [...parGroupe].filter(([id]) => !connus.has(id)).flatMap(([, dela]) => dela);
	const groupes = [...p.groupes]
		.sort((a, b) => a.ordre - b.ordre || a.id - b.id)
		.filter((g) => tous || parGroupe.has(g.id))
		.map((g) => noeudGroupe(g.id, g.libelle, parGroupe.get(g.id) ?? [], p));
	if (orphelines.length > 0) groupes.push(noeudGroupe(INCONNU, LIBELLE_INCONNU, orphelines, p));
	return { groupes, orphelines: orphelines.length };
}

/** Lignes dont `exerciceDuMouvement` est `e`, Natures neutres à part. */
function lignesDe(
	j: Pick<GrandJournal, 'operations' | 'exercices'>,
	e: Exercice,
	p: ParametrageEtats
) {
	const neutres = new Set(p.natures.filter((n) => n.neutre).map((n) => n.id));
	const toutes = j.operations
		.filter((op) => exerciceDuMouvement(j, op)?.id === e.id)
		.flatMap((op) => op.lignes.map((l) => vueLigne(l, op)));
	return {
		neutres: toutes.filter((l) => neutres.has(l.natureId)),
		courantes: toutes.filter((l) => !neutres.has(l.natureId) && l.exerciceRattachementId === e.id),
		anterieures: toutes.filter((l) => !neutres.has(l.natureId) && l.exerciceRattachementId !== e.id)
	};
}

type JournalEtat = Pick<GrandJournal, 'operations' | 'exercices'>;

export function compteDeResultat(
	j: JournalEtat,
	e: Exercice,
	p: ParametrageEtats
): CompteDeResultat {
	const { neutres, courantes, anterieures } = lignesDe(j, e, p);
	const courant = arbre(courantes, p, true);
	const anterieur = arbre(anterieures, p, false);
	const orphelines = courant.orphelines + anterieur.orphelines;
	return {
		exerciceId: e.id,
		...totauxDe(courantes),
		groupes: courant.groupes,
		anterieurs: { ...totauxDe(anterieures), groupes: anterieur.groupes },
		neutres: sommeCentimes(neutres.map((l) => l.montant)),
		anomalies: orphelines > 0 ? [{ code: 'anomalie_groupe', details: { lignes: orphelines } }] : []
	};
}

/** FR-30 : somme des Actions et des Lignes sans Action = résultat de l'Exercice. */
export function resultatParAction(
	j: JournalEtat,
	e: Exercice,
	p: ParametrageEtats
): ResultatParAction {
	const cr = compteDeResultat(j, e, p);
	const groupes = cr.groupes
		.filter((g) => g.actions.length > 0)
		.map((g) => ({ ...g, ...additionner(g.actions), sansAction: [] }));
	const sansAction = cr.groupes.flatMap((g) => g.sansAction).sort(parLibelle);
	const sansActionTotaux = additionner(sansAction);
	const total = additionner([...groupes, sansActionTotaux]);
	const difference = centimes(total.resultat - cr.resultat);
	return {
		exerciceId: e.id,
		...total,
		groupes,
		sansAction,
		sansActionTotaux,
		anterieurs: cr.anterieurs,
		anomalies: [
			...cr.anomalies,
			...(difference === 0
				? []
				: ([{ code: 'anomalie_actions', details: { difference } }] satisfies Anomalie[]))
		]
	};
}

/** Une seule Action, de son Groupe à ses Lignes. `null` si elle n'a rien sur cet Exercice. */
export function detailAction(r: ResultatParAction, actionId: number): NoeudAction | null {
	return r.groupes.flatMap((g) => g.actions).find((a) => a.actionId === actionId) ?? null;
}

/** Un Mouvement interne est en transit quand ses deux dates tombent dans deux Exercices. */
function transitDe(j: JournalEtat, e: Exercice): Centimes {
	const dans = (d: DateCivile) => d >= (e.debut as DateCivile) && d <= (e.fin as DateCivile);
	return sommeCentimes(
		j.operations
			.filter((op) => op.genre === 'interne')
			.filter((op) => op.cotes.some((c) => dans(c.date)) && !op.cotes.every((c) => dans(c.date)))
			.flatMap((op) => op.cotes.filter((c) => dans(c.date)).map((c) => c.montant))
	);
}

export type Explication = {
	resultat: Centimes;
	anterieures: Centimes;
	neutres: Centimes;
	transit: Centimes;
	/** Somme des quatre termes, à comparer à la variation lue sur les Comptes. */
	attendu: Centimes;
	variation: Centimes;
	difference: Centimes;
};

type JournalTresorerie = JournalEtat & Pick<GrandJournal, 'ancres' | 'comptes'>;

/** Soldes réellement portés par les Comptes : un écart avec les Lignes devient visible. */
function variationDe(j: JournalTresorerie, e: Exercice): Centimes {
	const fin = e.fin as DateCivile;
	return sommeCentimes(
		j.comptes.map((c) => centimes(soldeCompte(j, c.id, fin) - soldeDepart(j, c.id, e)))
	);
}

/** Équation de contrôle du §8, vérifiée à chaque état. */
export function equationDeControle(
	j: JournalTresorerie,
	e: Exercice,
	p: ParametrageEtats
): Explication {
	const { neutres, courantes, anterieures } = lignesDe(j, e, p);
	const somme = (l: readonly { montant: Centimes }[]) => sommeCentimes(l.map((x) => x.montant));
	const termes = {
		resultat: somme(courantes),
		anterieures: somme(anterieures),
		neutres: somme(neutres),
		transit: transitDe(j, e)
	};
	const attendu = sommeCentimes(Object.values(termes));
	const variation = variationDe(j, e);
	return { ...termes, attendu, variation, difference: centimes(variation - attendu) };
}

export function anomaliesEquation(explication: Explication): Anomalie[] {
	return explication.difference === 0
		? []
		: [{ code: 'anomalie_equation', details: { difference: explication.difference } }];
}
