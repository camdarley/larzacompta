/**
 * Tableau de contrôle (FR-15, FR-32) : pour chaque Compte, l'addition posée, le solde constaté,
 * l'Écart et ses causes, puis la `phrase-bilan`. Jamais rassurante si un Écart existe.
 */
import { joursEntre, type DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal } from '../journal.ts';
import { centimes, formaterMontant, type Centimes } from '../montant.ts';
import type { Compte } from '../parametrage.ts';
import { dernierConstat, ecart, ecartExplique, ouverts } from './ecart.ts';
import { soldeCompte, soldeDepart } from './soldes.ts';

/** Un relevé par mois, avec une marge (EXPERIENCE.md, Décisions). */
export const JOURS_CONTROLE_ANCIEN = 45;

export type EtatCarte = 'juste' | 'a_regarder' | 'ecart';

export type CarteCompte = {
	compte: Compte;
	/** Jour de comparaison : date du relevé, sinon dernier jour regardé de l'Exercice. */
	date: DateCivile;
	depart: Centimes;
	mouvements: Centimes;
	calcule: Centimes;
	constate: Centimes | null;
	dateConstat: DateCivile | null;
	ecart: Centimes | null;
	explique: Centimes;
	nonExplique: Centimes | null;
	/** Lignes et Opérations non pointées à cette date. */
	nonPointees: number;
	/** Plus de 45 jours depuis le dernier contrôle. */
	ancien: boolean;
	etat: EtatCarte;
	phraseEcart: string | null;
};

const CONTROLES = ['banque', 'epargne', 'caisse'] as const;
const estControle = (c: Compte) => (CONTROLES as readonly string[]).includes(c.type);
const estPointable = (c: Compte) => c.type === 'banque' || c.type === 'epargne';

/** « Écart de 12,50 €. 2 lignes non pointées l'expliquent. », jamais par la couleur seule. */
export function phraseEcart(
	brut: Centimes,
	explique: Centimes,
	nonPointees: number
): string | null {
	if (brut === 0) return null;
	const montant = formaterMontant(centimes(Math.abs(brut)));
	if (nonPointees === 0) return `Écart de ${montant}. Aucune ligne non pointée ne l’explique.`;
	const lignes = nonPointees === 1 ? '1 ligne non pointée' : `${nonPointees} lignes non pointées`;
	if (explique === brut) {
		return `Écart de ${montant}. ${lignes} ${nonPointees === 1 ? 'l’explique' : 'l’expliquent'}.`;
	}
	const reste = formaterMontant(centimes(Math.abs(brut - explique)));
	return `Écart de ${montant}. Après ${lignes}, il reste ${reste} à comprendre.`;
}

function etatDe(c: Pick<CarteCompte, 'nonExplique' | 'ecart' | 'constate' | 'ancien'>): EtatCarte {
	if (c.nonExplique !== null && c.nonExplique !== 0) return 'ecart';
	return c.constate === null || c.ancien || c.ecart !== 0 ? 'a_regarder' : 'juste';
}

type Journal = Pick<
	GrandJournal,
	'ancres' | 'operations' | 'constats' | 'pointages' | 'lignesReleve' | 'comptes' | 'exercices'
>;

export function carteCompte(
	j: Journal,
	compte: Compte,
	e: Exercice,
	aujourdhui: DateCivile
): CarteCompte {
	const debut = e.debut as DateCivile;
	const fin = e.fin as DateCivile;
	const reference = aujourdhui < fin ? aujourdhui : fin;
	// Un relevé d'un autre Exercice ne contrôle pas celui-ci.
	const lu = dernierConstat(j, compte.id, fin);
	const constat = lu !== undefined && lu.date >= debut ? lu : undefined;
	const date = constat?.date ?? (reference < debut ? debut : reference);
	const depart = soldeDepart(j, compte.id, e);
	const calcule = soldeCompte(j, compte.id, date);
	const brut = constat === undefined ? null : ecart(j, compte.id, date);
	const explique = constat === undefined ? centimes(0) : ecartExplique(j, compte.id, date);
	const elements = estPointable(compte) ? ouverts(j, compte.id, date) : null;
	const nonPointees = elements === null ? 0 : elements.lignes.length + elements.cotes.length;
	const carte = {
		compte,
		date,
		depart,
		mouvements: centimes(calcule - depart),
		calcule,
		constate: brut === null ? null : centimes(calcule + brut),
		dateConstat: constat?.date ?? null,
		ecart: brut,
		explique,
		nonExplique: brut === null ? null : centimes(brut - explique),
		nonPointees,
		ancien: constat !== undefined && joursEntre(constat.date, reference) > JOURS_CONTROLE_ANCIEN,
		phraseEcart: brut === null ? null : phraseEcart(brut, explique, nonPointees)
	};
	return { ...carte, etat: etatDe(carte) };
}

/** Comptes de l'Exercice regardé : un Compte ancré plus tard n'y existe pas encore. */
export function cartesComptes(j: Journal, e: Exercice, aujourdhui: DateCivile): CarteCompte[] {
	const anneeAncre = (compteId: number) => {
		const id = j.ancres.find((a) => a.compteId === compteId)?.exerciceId;
		return j.exercices.find((x) => x.id === id)?.anneeDebut ?? e.anneeDebut;
	};
	return j.comptes
		.filter((c) => c.actif && estControle(c) && anneeAncre(c.id) <= e.anneeDebut)
		.map((c) => carteCompte(j, c, e, aujourdhui));
}

export type TacheControle = 'lignes' | 'pieces' | 'anciennes';
export type Tache = { id: TacheControle; compteur: number };

/** Non pointées, jusqu'à la fin de l'Exercice regardé : une ligne d'avant ne s'oublie pas. */
export function lignesNonPointees(
	j: Pick<GrandJournal, 'lignesReleve' | 'pointages'>,
	e: Exercice
): number {
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	return j.lignesReleve.filter((l) => !pointees.has(l.id) && l.date <= (e.fin as DateCivile))
		.length;
}

/** Côtés non pointés, antérieurs au début du dernier relevé de leur Compte (FR-15). */
export function operationsAnciennes(
	j: Pick<GrandJournal, 'operations' | 'pointages' | 'lignesReleve' | 'comptes'>,
	debutsReleve: ReadonlyMap<number, DateCivile>,
	e: Exercice
): number[] {
	const pointes = new Set(j.pointages.flatMap((p) => p.coteIds));
	const fin = e.fin as DateCivile;
	return j.operations
		.filter((op) =>
			op.cotes.some((c) => {
				const debut = debutsReleve.get(c.compteId);
				return debut !== undefined && c.date < debut && c.date <= fin && !pointes.has(c.id);
			})
		)
		.map((op) => op.id);
}

export type Bilan =
	| { type: 'ecart'; comptes: number }
	| { type: 'taches'; nombre: number }
	| { type: 'premier_releve' }
	| { type: 'a_jour' };

/**
 * Ce qui reste à regarder sur un Compte et qu'aucune tuile ne compte déjà : un contrôle ancien,
 * un solde jamais constaté, un Écart sans aucun élément non pointé.
 */
function aRegarderSeul(c: CarteCompte): boolean {
	if (c.etat !== 'a_regarder') return false;
	return c.constate === null || c.ancien || c.nonPointees === 0;
}

/** Sans relevé sur l'Exercice : aucun Compte pointable n'a ni ligne ni solde à comparer. */
export function sansReleve(
	j: Pick<GrandJournal, 'lignesReleve'>,
	cartes: readonly CarteCompte[],
	e: Exercice
): boolean {
	const pointables = cartes.filter((c) => estPointable(c.compte));
	return (
		pointables.length > 0 &&
		pointables.every((c) => c.dateConstat === null) &&
		!j.lignesReleve.some(
			(l) =>
				pointables.some((c) => c.compte.id === l.compteId) &&
				l.date >= (e.debut as DateCivile) &&
				l.date <= (e.fin as DateCivile)
		)
	);
}

/** Du plus grave au plus doux. Sans relevé, jamais « Tout est à jour ». */
export function bilan(
	cartes: readonly CarteCompte[],
	taches: readonly Tache[],
	premierReleve: boolean
): Bilan {
	const faux = cartes.filter((c) => c.etat === 'ecart').length;
	if (faux > 0) return { type: 'ecart', comptes: faux };
	const pointables = (c: CarteCompte) => !premierReleve || !estPointable(c.compte);
	const nombre =
		taches.reduce((n, t) => n + t.compteur, 0) +
		cartes.filter((c) => pointables(c) && aRegarderSeul(c)).length;
	if (nombre > 0) return { type: 'taches', nombre };
	return premierReleve ? { type: 'premier_releve' } : { type: 'a_jour' };
}

export function phraseBilan(b: Bilan): string {
	if (b.type === 'ecart') {
		return b.comptes === 1
			? '1 Compte ne tombe pas juste.'
			: `${b.comptes} Comptes ne tombent pas juste.`;
	}
	if (b.type === 'taches') {
		return b.nombre === 1 ? '1 petite chose à regarder.' : `${b.nombre} petites choses à regarder.`;
	}
	return b.type === 'a_jour'
		? 'Tout est à jour.'
		: 'Importez votre premier relevé pour commencer le contrôle.';
}

/** Date de la dernière Ligne de relevé pointée, pour « Dernier relevé pointé le 20 octobre. » */
export function dernierPointage(
	j: Pick<GrandJournal, 'lignesReleve' | 'pointages'>,
	e: Exercice
): DateCivile | null {
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	const dates = j.lignesReleve
		.filter((l) => pointees.has(l.id) && l.date <= (e.fin as DateCivile))
		.map((l) => l.date)
		.sort();
	return dates.at(-1) ?? null;
}
