/**
 * Virements entre Comptes vus depuis les relevés (FR-7). Une même somme paraît sur deux relevés :
 * les rapprocher évite de saisir deux fois un Mouvement interne. Ces fonctions lisent, sans écrire.
 */
import { joursEntre, type DateCivile } from '../dates.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type { GrandJournal, LigneReleveJ } from '../journal.ts';
import type { Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

/** Au-delà, deux montants opposés ne sont plus un virement, mais une coïncidence. */
export const JOURS_VIREMENT = 5;

type JournalVirement = Pick<GrandJournal, 'lignesReleve' | 'pointages' | 'comptes' | 'exercices'>;

export type VirementCroise = {
	ligneId: number;
	compteLibelle: string;
	date: DateCivile;
	/** Compte de la ligne d'en face, celle qui reste à rapprocher de la ligne active. */
	sens: 'depuis' | 'vers';
};

const pointable = (j: Pick<GrandJournal, 'comptes'>, compteId: number) => {
	const type = j.comptes.find((c) => c.id === compteId)?.type;
	return type === 'banque' || type === 'epargne';
};

const dansOuvert = (j: Pick<GrandJournal, 'exercices'>, d: DateCivile) =>
	exerciceDeDate(j.exercices, d)?.statut === 'ouvert';

/** Lignes libres d'un Compte pointable, par montant : une seule passe, même sur un gros relevé. */
export function indexVirements(j: JournalVirement): Map<number, LigneReleveJ[]> {
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	const index = new Map<number, LigneReleveJ[]>();
	const ouverte = new Map<DateCivile, boolean>();
	const dateOuverte = (d: DateCivile) => {
		const connue = ouverte.get(d);
		if (connue !== undefined) return connue;
		const valeur = dansOuvert(j, d);
		ouverte.set(d, valeur);
		return valeur;
	};
	const comptes = new Set(j.comptes.filter((c) => pointable(j, c.id)).map((c) => c.id));
	for (const l of j.lignesReleve) {
		if (pointees.has(l.id) || l.doublon === 'a_confirmer' || !comptes.has(l.compteId)) continue;
		if (!dateOuverte(l.date)) continue;
		const memes = index.get(l.montant);
		if (memes) memes.push(l);
		else index.set(l.montant, [l]);
	}
	return index;
}

/** La ligne d'en face la plus proche en date, sur un autre Compte, si elle existe. */
export function virementCroise(
	j: JournalVirement,
	ligne: LigneReleveJ,
	index: Map<number, LigneReleveJ[]>
): VirementCroise | null {
	if (!dansOuvert(j, ligne.date) || !pointable(j, ligne.compteId)) return null;
	const [face] = (index.get(-ligne.montant) ?? [])
		.filter(
			(l) =>
				l.compteId !== ligne.compteId && Math.abs(joursEntre(l.date, ligne.date)) <= JOURS_VIREMENT
		)
		.sort(
			(a, b) =>
				Math.abs(joursEntre(a.date, ligne.date)) - Math.abs(joursEntre(b.date, ligne.date)) ||
				a.id - b.id
		);
	if (face === undefined) return null;
	return {
		ligneId: face.id,
		compteLibelle: j.comptes.find((c) => c.id === face.compteId)?.libelle ?? '',
		date: face.date,
		sens: face.montant < 0 ? 'depuis' : 'vers'
	};
}

export type LignesVirement = { sortie: LigneReleveJ; entree: LigneReleveJ };

/** Revérifie tout à l'écriture : la vue peut dater d'avant un autre Pointage. */
export function deciderVirement(
	j: JournalVirement,
	ligneId: number,
	autreLigneId: number
): Resultat<LignesVirement> {
	const a = j.lignesReleve.find((l) => l.id === ligneId);
	const b = j.lignesReleve.find((l) => l.id === autreLigneId);
	if (a === undefined || b === undefined) return echec('element_introuvable');
	const pointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));
	if (
		a.compteId === b.compteId ||
		a.montant + b.montant !== 0 ||
		pointees.has(a.id) ||
		pointees.has(b.id) ||
		!pointable(j, a.compteId) ||
		!pointable(j, b.compteId)
	) {
		return echec('pointage_incoherent');
	}
	if (a.doublon === 'a_confirmer' || b.doublon === 'a_confirmer') {
		return echec('doublon_a_confirmer');
	}
	if (!dansOuvert(j, a.date) || !dansOuvert(j, b.date)) {
		return echec('date_hors_exercice', { champ: 'date' });
	}
	return succes(a.montant < 0 ? { sortie: a, entree: b } : { sortie: b, entree: a });
}

export type DateDecalee = {
	pointageId: number;
	coteId: number;
	operationId: number;
	dateCote: DateCivile;
	dateReleve: DateCivile;
	montant: Centimes;
};

type JournalDecalage = Pick<
	GrandJournal,
	'operations' | 'pointages' | 'lignesReleve' | 'exercices'
>;

/**
 * Pointages où l'Opération est datée après le relevé qui la porte : au jour du relevé, le calcul
 * ne la compte pas encore, d'où un Écart alors que tout est pointé.
 */
export function datesDecalees(j: JournalDecalage, compteId: number, d: DateCivile): DateDecalee[] {
	const duCompte = j.pointages.filter(
		(p) => p.compteId === compteId && p.coteIds.length === 1 && p.ligneReleveIds.length === 1
	);
	if (duCompte.length === 0) return [];
	const lignes = new Map(j.lignesReleve.map((l) => [l.id, l]));
	const cotes = new Map(
		j.operations.flatMap((operation) =>
			operation.cotes.map((cote) => [cote.id, { cote, operation }] as const)
		)
	);
	return duCompte.flatMap((p) => {
		const ligne = lignes.get(p.ligneReleveIds[0] as number);
		const trouve = cotes.get(p.coteIds[0] as number);
		if (ligne === undefined || trouve === undefined) return [];
		const { cote, operation } = trouve;
		if (!(ligne.date <= d && cote.date > d)) return [];
		if (!redatable(j, cote.date, ligne.date).ok) return [];
		return [
			{
				pointageId: p.id,
				coteId: cote.id,
				operationId: operation.id,
				dateCote: cote.date,
				dateReleve: ligne.date,
				montant: cote.montant
			}
		];
	});
}

/** Redater ne doit faire changer d'Exercice à personne, et jamais toucher à un Exercice clôturé. */
export function redatable(
	j: Pick<GrandJournal, 'exercices'>,
	de: DateCivile,
	vers: DateCivile
): Resultat<true> {
	const a = exerciceDeDate(j.exercices, de);
	const b = exerciceDeDate(j.exercices, vers);
	if (a === undefined || a.id !== b?.id || a.statut !== 'ouvert') {
		return echec('date_hors_exercice', { champ: 'date' });
	}
	return succes(true);
}
