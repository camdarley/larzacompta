/** Invariants du Pointage, contrôlés au seul point d'écriture (SCHEMA-DONNEES §6, P1 à P5). */
import { type DateCivile } from '../dates.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, LigneReleveJ, PointageJ } from '../journal.ts';
import { centimes, formaterMontant, sommeCentimes, type Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

export type DemandePointage = { compteId: number; coteIds: number[]; ligneIds: number[] };

type JournalPointage = Pick<
	GrandJournal,
	'operations' | 'pointages' | 'lignesReleve' | 'comptes' | 'exercices'
>;

const incoherent = () => echec<never>('pointage_incoherent');

/** Différence entre les Lignes de relevé et les Côtés. P1, P3 et P4 sont contrôlés ici. */
export function differencePointage(j: JournalPointage, d: DemandePointage): Resultat<Centimes> {
	const compte = j.comptes.find((c) => c.id === d.compteId);
	if (compte?.type !== 'banque' && compte?.type !== 'epargne') return incoherent();
	if (d.coteIds.length === 0 || d.ligneIds.length === 0) return incoherent();

	const tous = j.operations.flatMap((o) => o.cotes);
	const cotes = d.coteIds.map((id) => tous.find((c) => c.id === id));
	const lignes = d.ligneIds.map((id) => j.lignesReleve.find((l) => l.id === id));
	const pointes = new Set(j.pointages.flatMap((p) => p.coteIds));
	const lignesPointees = new Set(j.pointages.flatMap((p) => p.ligneReleveIds));

	for (const c of cotes) {
		if (c?.compteId !== d.compteId || pointes.has(c.id)) return incoherent();
	}
	for (const l of lignes) {
		if (l?.compteId !== d.compteId || lignesPointees.has(l.id)) return incoherent();
		if (l.doublon === 'a_confirmer') return echec('doublon_a_confirmer');
	}

	const sommeLignes = sommeCentimes(lignes.flatMap((l) => l?.montant ?? []));
	const sommeCotes = sommeCentimes(cotes.flatMap((c) => c?.montant ?? []));
	return succes(centimes(sommeLignes - sommeCotes));
}

/** P1 à P4. Un Pointage se crée à toute date : une Ligne d'août reste pointable après la clôture. */
export function deciderPointage(j: JournalPointage, d: DemandePointage): Resultat<true> {
	const difference = differencePointage(j, d);
	if (!difference.ok) return difference;
	if (difference.valeur !== 0) {
		return echec('pointage_desequilibre', {
			montant: formaterMontant(centimes(Math.abs(difference.valeur))),
			difference: difference.valeur
		});
	}
	return succes(true);
}

/** Refusée seulement si tout ce que le Pointage relie est dans un Exercice clôturé (AD-8). */
export function deciderAnnulationPointage(
	j: Pick<GrandJournal, 'operations' | 'lignesReleve' | 'exercices'>,
	p: PointageJ
): Resultat<true> {
	const dates = [
		...j.operations.flatMap((o) =>
			o.cotes.filter((c) => p.coteIds.includes(c.id)).map((c) => c.date)
		),
		...j.lignesReleve.filter((l) => p.ligneReleveIds.includes(l.id)).map((l) => l.date)
	];
	const figees = dates.every((d) => exerciceDeDate(j.exercices, d)?.statut === 'cloture');
	return dates.length > 0 && figees ? echec('pointage_fige') : succes(true);
}

/** P5 : pointée, jamais. Importée, seulement pour écarter un doublon. Saisie à la main, oui. */
export function deciderRetrait(
	j: Pick<GrandJournal, 'pointages'>,
	ligne: LigneReleveJ
): Resultat<true> {
	if (j.pointages.some((p) => p.ligneReleveIds.includes(ligne.id))) {
		return echec('ligne_releve_pointee');
	}
	if (ligne.importId !== null && ligne.doublon !== 'a_confirmer') {
		return echec('ligne_releve_conservee');
	}
	return succes(true);
}

/**
 * Date d'une Opération née d'une Ligne de relevé. Dans un Exercice clôturé, elle passe au premier
 * jour de l'Exercice ouvert, et sa Ligne se rattache à l'Exercice clôturé (EXPERIENCE.md).
 */
export function dateDepuisLigne(
	exercices: readonly Exercice[],
	date: DateCivile
): { date: DateCivile; rattachementId: number | null } {
	const courant = exerciceDeDate(exercices, date);
	if (courant?.statut === 'ouvert') return { date, rattachementId: null };
	const ouvert = [...exercices]
		.filter((e) => e.statut === 'ouvert' && e.debut !== null)
		.sort((a, b) => a.anneeDebut - b.anneeDebut)[0];
	if (ouvert?.debut == null) return { date, rattachementId: null };
	return { date: ouvert.debut, rattachementId: courant?.id ?? null };
}
