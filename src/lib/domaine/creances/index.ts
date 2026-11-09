/**
 * Créances et Dettes (AD-12, F1, F2). Comptabilité de trésorerie : une Créance ou une Dette ne
 * produit aucune Ligne. Le reste dû se calcule à la date demandée, rien n'est stocké (AD-4).
 */
import { ajouterJours, instantVersDate, type DateCivile, type Instant } from '../dates.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import { anneeExerciceDe, type Exercice } from '../exercices.ts';
import type { CreanceDetteJ, GrandJournal, OperationJ, PieceJ } from '../journal.ts';
import { centimes, type Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

export type Sens = CreanceDetteJ['sens'];

type JournalReglements = Pick<GrandJournal, 'operations'>;

const nonAnnulees = (j: JournalReglements) => new Map(j.operations.map((o) => [o.id, o] as const));

function somme(valeurs: readonly number[]): Centimes {
	return centimes(valeurs.reduce((total, v) => total + v, 0));
}

/**
 * F2 : montant − règlements d'Opérations non annulées datées au plus tard `d`.
 * Annulée, elle vaut 0 à partir de sa date d'annulation seulement : un état passé ne bouge pas.
 * `figeLe` : clôture de l'Exercice lu. Une annulation venue après ne le touche plus (FR-3).
 */
export function resteDu(
	c: CreanceDetteJ,
	j: JournalReglements,
	d: DateCivile,
	figeLe: Instant | null = null
): Centimes {
	const annulee = c.annuleeLe !== null && (figeLe === null || c.annuleeLe <= figeLe);
	if (annulee && instantVersDate(c.annuleeLe as Instant) <= d) return centimes(0);
	const operations = nonAnnulees(j);
	const regle = c.reglements.filter((r) => {
		const op = operations.get(r.operationId);
		return op !== undefined && op.date <= d;
	});
	return centimes(c.montant - somme(regle.map((r) => r.montant)));
}

/** F1 : tout ce qui est réglé, quelle qu'en soit la date. Une Opération annulée ne compte plus. */
export function totalRegle(c: CreanceDetteJ, j: JournalReglements): Centimes {
	const operations = nonAnnulees(j);
	return somme(c.reglements.filter((r) => operations.has(r.operationId)).map((r) => r.montant));
}

export type EntreeCreance = {
	sens: Sens;
	tiers: string;
	motif: string;
	montant: Centimes;
	date: DateCivile;
	actionId: number | null;
	note: string | null;
};

/**
 * Tout ce qui précède la fin d'un Exercice clôturé est figé, repris d'avant le premier Exercice
 * compris : son état dirait une autre Dette (FR-3). Le trigger le redit, l'écran l'explique ici.
 */
export function deciderCreance(
	e: EntreeCreance,
	exercices: readonly Exercice[]
): Resultat<EntreeCreance> {
	const exercice = exercices
		.filter((x) => x.statut === 'cloture' && e.date <= (x.fin as DateCivile))
		.sort((a, b) => b.anneeDebut - a.anneeDebut)[0];
	if (exercice !== undefined) {
		return echec('exercice_cloture', { exercice: exercice.libelle, champ: 'date' });
	}
	return succes(e);
}

/** Une Créance de Facture suit sa Facture : seul un Avoir l'annule, et rien ne la rétablit (FR-28). */
export const geeParSaFacture = (c: Pick<CreanceDetteJ, 'sens' | 'factureId'>) =>
	c.sens === 'creance' && (c.factureId ?? null) !== null;

export type ExerciceClos = Exercice & { clotureLe: Instant };

/**
 * Une annulation qu'une clôture a vue fait partie de l'état clos : si cet état la montre à 0, la
 * rétablir le changerait (FR-3). Annulée après la clôture ou après sa fin, rien n'y paraît.
 */
export function deciderRetablissement(
	c: Pick<CreanceDetteJ, 'date' | 'annuleeLe'>,
	closes: readonly ExerciceClos[]
): Resultat<true> {
	const annuleeLe = c.annuleeLe;
	if (annuleeLe === null) return succes(true);
	const jour = instantVersDate(annuleeLe);
	const exercice = closes.find((x) => {
		const fin = x.fin as DateCivile;
		return c.date <= fin && jour <= fin && annuleeLe <= x.clotureLe;
	});
	return exercice ? echec('exercice_cloture', { exercice: exercice.libelle }) : succes(true);
}

export type PartReglement = { creanceId: number; montant: Centimes };

/**
 * Une Opération solde une ou plusieurs sommes (F1). Une Créance s'encaisse, une Dette se paie.
 * Plusieurs parts ne dépassent pas ce que l'Opération déplace.
 */
export function deciderReglements(
	parts: readonly PartReglement[],
	montantOperation: Centimes,
	j: Pick<GrandJournal, 'operations' | 'creancesDettes'>
): Resultat<true> {
	if (parts.length === 0) return echec('element_introuvable');
	for (const part of parts) {
		const c = j.creancesDettes.find((x) => x.id === part.creanceId);
		if (c === undefined) return echec('element_introuvable');
		if (c.annuleeLe !== null) return echec('creance_annulee');
		if ((c.sens === 'creance') !== montantOperation > 0) return echec('reglement_sens');
		const memeSomme = parts.filter((p) => p.creanceId === part.creanceId);
		const demande = somme(memeSomme.map((p) => p.montant));
		if (totalRegle(c, j) + demande > c.montant) return echec('reglement_excessif');
	}
	return controlerParts(somme(parts.map((p) => p.montant)), montantOperation);
}

function controlerParts(total: Centimes, montantOperation: Centimes): Resultat<true> {
	return total > Math.abs(montantOperation) ? echec('reglement_depasse_operation') : succes(true);
}

/** Corriger une Opération qui solde une somme : ses parts doivent encore y tenir. */
export function controlerCorrection(
	operationId: number,
	nouveauMontant: Centimes,
	j: Pick<GrandJournal, 'creancesDettes'>
): Resultat<true> {
	const lies = j.creancesDettes.flatMap((c) =>
		c.reglements.filter((r) => r.operationId === operationId).map((r) => ({ c, r }))
	);
	if (lies.length === 0) return succes(true);
	if (lies.some(({ c }) => (c.sens === 'creance') !== nouveauMontant > 0)) {
		return echec('reglement_sens');
	}
	return controlerParts(somme(lies.map(({ r }) => r.montant)), nouveauMontant);
}

/** Veille du premier Exercice tenu : une somme reprise date toujours d'avant l'ancre (FR-40). */
export function dateDeReprise(exercices: readonly Exercice[]): DateCivile | null {
	const debuts = exercices.flatMap((e) => (e.debut === null ? [] : [e.debut])).sort();
	const premier = debuts[0];
	return premier === undefined ? null : ajouterJours(premier, -1);
}

/** Exercice d'une date : tenu si elle y tombe, sinon le repère de cette année-là. */
export function exerciceOrigine(
	exercices: readonly Exercice[],
	date: DateCivile
): Exercice | undefined {
	const tenu = exerciceDeDate(exercices, date);
	if (tenu) return tenu;
	const reperes = exercices
		.filter((e) => e.statut === 'repere')
		.sort((a, b) => a.anneeDebut - b.anneeDebut);
	const premier = exercices
		.filter((e) => e.debut !== null)
		.sort((a, b) => a.anneeDebut - b.anneeDebut)[0];
	if (premier?.debut == null) return reperes.at(-1);
	const annee = anneeExerciceDe(date, Number(premier.debut.slice(5, 7)));
	return reperes.find((e) => e.anneeDebut === annee) ?? reperes.at(-1);
}

/**
 * Payée sur un Exercice ultérieur, la somme se rattache à son Exercice d'origine : le paiement
 * n'entre pas dans le résultat de l'année où il tombe (O6, FR-40). Proposé, jamais imposé.
 */
export function rattachementPropose(
	exercices: readonly Exercice[],
	c: Pick<CreanceDetteJ, 'date'>,
	datePaiement: DateCivile
): Exercice | null {
	const origine = exerciceOrigine(exercices, c.date);
	const paiement = exerciceDeDate(exercices, datePaiement);
	if (origine === undefined || paiement === undefined) return null;
	return origine.anneeDebut < paiement.anneeDebut ? origine : null;
}

export type RangeeSuivi = {
	id: number;
	sens: Sens;
	tiers: string;
	motif: string;
	action: string | null;
	date: DateCivile;
	montant: Centimes;
	reste: Centimes;
	note: string | null;
	/** Née d'une Facture ou d'un Avoir : la rangée y mène, et ne s'annule pas ici. */
	factureId: number | null;
	geree: boolean;
	/** La facture reçue, la notification. Une Dette sans Pièce se signale (bilan). */
	pieces: PieceJ[];
};

export type BlocSuivi = { rangees: RangeeSuivi[]; total: Centimes };
export type SuiviCreances = { aRecevoir: BlocSuivi; aPayer: BlocSuivi; date: DateCivile };

/** Ce qui reste dû à `d` : une somme soldée, annulée ou pas encore née n'y figure pas. */
export function suivi(
	j: Pick<GrandJournal, 'operations' | 'creancesDettes'>,
	actions: readonly { id: number; libelle: string }[],
	d: DateCivile,
	figeLe: Instant | null = null
): SuiviCreances {
	const rangees = j.creancesDettes.flatMap((c): RangeeSuivi[] => {
		const reste = c.date <= d ? resteDu(c, j, d, figeLe) : centimes(0);
		if (reste === 0) return [];
		return [
			{
				id: c.id,
				sens: c.sens,
				tiers: c.tiers,
				motif: c.motif,
				action: actions.find((a) => a.id === c.actionId)?.libelle ?? null,
				date: c.date,
				montant: c.montant,
				reste,
				note: c.note,
				factureId: c.factureId ?? null,
				geree: geeParSaFacture(c),
				pieces: c.pieces ?? []
			}
		];
	});
	const bloc = (sens: Sens): BlocSuivi => {
		const liste = rangees.filter((r) => r.sens === sens);
		return { rangees: liste, total: somme(liste.map((r) => r.reste)) };
	};
	return { aRecevoir: bloc('creance'), aPayer: bloc('dette'), date: d };
}

/** Ce que le `panneau` reprend pour solder une somme : rien à ressaisir. */
export type SommeASolder = {
	id: number;
	sens: Sens;
	tiers: string;
	motif: string;
	actionId: number | null;
	reste: Centimes;
	rattachementId: number | null;
	exerciceOrigine: string | null;
	/** N° de la Facture d'origine : il devient la référence de l'Opération. */
	numero: string | null;
	/** Jointes à l'Opération qui la solde. */
	pieces: PieceJ[];
};

export function sommeASolder(
	c: CreanceDetteJ,
	j: Pick<GrandJournal, 'operations' | 'exercices'>,
	aujourdhui: DateCivile
): SommeASolder | null {
	if (c.annuleeLe !== null) return null;
	const reste = centimes(c.montant - totalRegle(c, j));
	if (reste <= 0) return null;
	const propose = rattachementPropose(j.exercices, c, aujourdhui);
	return {
		id: c.id,
		sens: c.sens,
		tiers: c.tiers,
		motif: c.motif,
		actionId: c.actionId,
		reste,
		rattachementId: propose?.id ?? null,
		exerciceOrigine: propose?.libelle ?? null,
		numero: c.factureNumero ?? null,
		pieces: c.pieces ?? []
	};
}

export type SoldeDeSomme = {
	creanceId: number;
	sens: Sens;
	tiers: string;
	motif: string;
	montant: Centimes;
};

/** Les sommes que soldent une Opération : le `panneau` les montre. */
export function sommesSoldees(
	op: Pick<OperationJ, 'id'>,
	j: Pick<GrandJournal, 'creancesDettes'>
): SoldeDeSomme[] {
	return j.creancesDettes.flatMap((c) =>
		c.reglements
			.filter((r) => r.operationId === op.id)
			.map((r) => ({
				creanceId: c.id,
				sens: c.sens,
				tiers: c.tiers,
				motif: c.motif,
				montant: r.montant
			}))
	);
}

/**
 * Dette due à la fin de l'Exercice, sans Pièce : le bilan l'inscrit, rien ne la justifie. Celle
 * d'un Avoir a le sien.
 */
export function dettesSansPiece(
	j: Pick<GrandJournal, 'operations' | 'creancesDettes'>,
	d: DateCivile,
	figeLe: Instant | null = null
): number {
	return j.creancesDettes.filter(
		(c) =>
			c.sens === 'dette' &&
			(c.factureId ?? null) === null &&
			(c.pieces ?? []).length === 0 &&
			c.date <= d &&
			resteDu(c, j, d, figeLe) > 0
	).length;
}
