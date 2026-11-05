/** Soldes et rangement d'une Ligne (SCHEMA-DONNEES §8). Tout est une fonction pure du journal. */
import { ajouterJours, type DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, OperationJ } from '../journal.ts';
import { centimes, type Centimes } from '../montant.ts';
import type { Action, Nature } from '../parametrage.ts';

export function exerciceDeDate(
	exercices: readonly Exercice[],
	date: DateCivile
): Exercice | undefined {
	return exercices.find(
		(e) => e.debut !== null && e.fin !== null && e.debut <= date && date <= e.fin
	);
}

export function exerciceDuMouvement(
	j: Pick<GrandJournal, 'exercices'>,
	op: Pick<OperationJ, 'date'>
): Exercice | undefined {
	return exerciceDeDate(j.exercices, op.date);
}

type JournalSolde = Pick<GrandJournal, 'ancres' | 'operations'> &
	Partial<Pick<GrandJournal, 'exercices'>>;

/** Une ancre posée sur un Exercice qui suit `d` ne dit rien de ce jour-là. */
function ancreLue(j: JournalSolde, compteId: number, d: DateCivile): Centimes {
	const ancre = j.ancres.find((a) => a.compteId === compteId);
	if (ancre === undefined) return centimes(0);
	const debut = j.exercices?.find((e) => e.id === ancre.exerciceId)?.debut ?? null;
	return debut !== null && d < debut ? centimes(0) : ancre.solde;
}

/** Ancre (0 si absente, ou encore à venir) + somme des Côtés du Compte datés au plus tard `d`. */
export function soldeCompte(j: JournalSolde, compteId: number, d: DateCivile): Centimes {
	let solde: number = ancreLue(j, compteId, d);
	for (const op of j.operations) {
		for (const c of op.cotes) {
			if (c.compteId === compteId && c.date <= d) solde += c.montant;
		}
	}
	return centimes(solde);
}

/** `soldeCompte` la veille du début, ou l'ancre si elle tombe à ce début. */
export function soldeDepart(
	j: JournalSolde & Pick<GrandJournal, 'exercices'>,
	compteId: number,
	e: Exercice
): Centimes {
	const ancre = j.ancres.find((a) => a.compteId === compteId);
	if (ancre?.exerciceId === e.id) return ancre.solde;
	if (e.debut === null) return ancre?.solde ?? centimes(0);
	return soldeCompte(j, compteId, ajouterJours(e.debut, -1));
}

export type Colonne = 'recette' | 'depense';

/** Recette si (montant > 0) ≠ est_reduction, sinon Dépense (AD-6). */
export function colonneDe(ligne: { montant: Centimes; estReduction: boolean }): Colonne {
	return ligne.montant > 0 !== ligne.estReduction ? 'recette' : 'depense';
}

/** Groupe de l'Action, sinon Groupe de la Nature : toute Ligne a exactement un Groupe. */
export function groupeDe(
	ligne: { natureId: number; actionId: number | null },
	p: {
		natures: readonly Pick<Nature, 'id' | 'groupeId'>[];
		actions: readonly Pick<Action, 'id' | 'groupeId'>[];
	}
): number | undefined {
	const action = p.actions.find((a) => a.id === ligne.actionId);
	return action?.groupeId ?? p.natures.find((n) => n.id === ligne.natureId)?.groupeId;
}
