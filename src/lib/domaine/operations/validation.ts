/** Invariants d'une Opération, contrôlés au seul point d'écriture (SCHEMA-DONNEES §6, AD-7). */
import { formaterMontant, centimes, type Centimes } from '../montant.ts';
import type { DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type { Genre, ModePaiement, Origine } from '../journal.ts';
import type { Ancre, Compte } from '../parametrage.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

export type CoteSaisi = { compteId: number; date: DateCivile; montant: Centimes };

export type LigneSaisie = {
	montant: Centimes;
	estReduction: boolean;
	natureId: number;
	actionId: number | null;
	/** Null : l'Exercice de l'Opération (O6). */
	exerciceRattachementId: number | null;
	note: string | null;
};

export type Brouillon = {
	genre: Genre;
	origine: Origine;
	date: DateCivile;
	libelle: string;
	reference: string | null;
	modePaiement: ModePaiement | null;
	note: string | null;
	tiers: string | null;
	sansPiece: boolean;
	cotes: CoteSaisi[];
	lignes: LigneSaisie[];
};

/** Brouillon validé : chaque Ligne connaît son Exercice de rattachement. */
export type BrouillonValide = Omit<Brouillon, 'lignes'> & {
	lignes: (Omit<LigneSaisie, 'exerciceRattachementId'> & { exerciceRattachementId: number })[];
};

export type ReferencesSaisie = {
	exercices: readonly Exercice[];
	ancres: readonly Ancre[];
	comptes: readonly Pick<Compte, 'id' | 'actif'>[];
	natures: readonly { id: number; actif: boolean }[];
	actions: readonly { id: number; actif: boolean }[];
};

/** Ce que l'Opération portait déjà : une référence inactive y reste permise (O11). */
export type ExistantLignes = { natureIds: readonly number[]; actionIds: readonly number[] };

const AUCUN: ExistantLignes = { natureIds: [], actionIds: [] };

const invalide = () => echec<never>('forme_invalide');

function somme(valeurs: readonly { montant: Centimes }[]) {
	let total = 0;
	for (const v of valeurs) total += v.montant;
	return total;
}

/** O2, O3, O4. */
function controlerForme(b: Brouillon): Resultat<true> {
	if (b.cotes.some((c) => c.montant === 0) || b.lignes.some((l) => l.montant === 0)) {
		return invalide();
	}
	if (b.genre === 'standard') {
		const [cote] = b.cotes;
		if (b.cotes.length !== 1 || b.lignes.length === 0 || cote?.date !== b.date) return invalide();
	}
	if (b.genre === 'interne') {
		const [a, c] = b.cotes;
		if (a === undefined || c === undefined || b.cotes.length !== 2) return invalide();
		const sortant = a.montant < 0 ? a : c;
		if (
			b.lignes.length > 0 ||
			a.compteId === c.compteId ||
			a.montant + c.montant !== 0 ||
			sortant.date !== b.date
		) {
			return invalide();
		}
	}
	if (b.genre === 'compensee') {
		const [cote] = b.cotes;
		const recette = b.lignes.some((l) => l.montant > 0);
		const depense = b.lignes.some((l) => l.montant < 0);
		if (b.cotes.length > 1 || !recette || !depense) return invalide();
		if (cote !== undefined && cote.date !== b.date) return invalide();
	}
	return succes(true);
}

/** O5 : dans un Exercice ouvert, et jamais avant l'ancre du Compte. */
function controlerDates(b: Brouillon, r: ReferencesSaisie): Resultat<true> {
	const refus = echec<never>('date_hors_exercice', { champ: 'date' });
	const ouvert = (d: DateCivile) => exerciceDeDate(r.exercices, d)?.statut === 'ouvert';
	if (!ouvert(b.date) || !b.cotes.every((c) => ouvert(c.date))) return refus;
	for (const c of b.cotes) {
		const ancre = r.ancres.find((a) => a.compteId === c.compteId);
		const exercice = r.exercices.find((e) => e.id === ancre?.exerciceId);
		if (exercice?.debut && c.date < exercice.debut) return refus;
	}
	return succes(true);
}

/** O6 : l'Exercice de la date, ou un Exercice d'`annee_debut` inférieure. Par défaut, le premier. */
function controlerRattachements(
	b: Brouillon,
	r: ReferencesSaisie,
	courant: Exercice
): Resultat<BrouillonValide['lignes']> {
	const lignes: BrouillonValide['lignes'] = [];
	for (const [i, l] of b.lignes.entries()) {
		const id = l.exerciceRattachementId ?? courant.id;
		const cible = r.exercices.find((e) => e.id === id);
		if (cible === undefined || cible.anneeDebut > courant.anneeDebut) {
			return echec('rattachement_invalide', { champ: `lignes.${i}.rattachement` });
		}
		lignes.push({ ...l, exerciceRattachementId: id });
	}
	return succes(lignes);
}

/** O11 : refusée sur une nouvelle Ligne, conservée sur l'existant. */
function controlerReferences(
	b: Brouillon,
	r: ReferencesSaisie,
	existant: ExistantLignes
): Resultat<true> {
	for (const c of b.cotes) {
		const compte = r.comptes.find((x) => x.id === c.compteId);
		if (compte === undefined) return echec('element_introuvable');
		if (!compte.actif) return echec('compte_inactif', { champ: 'compteId' });
	}
	for (const [i, l] of b.lignes.entries()) {
		const nature = r.natures.find((n) => n.id === l.natureId);
		if (nature === undefined) return echec('element_introuvable');
		if (!nature.actif && !existant.natureIds.includes(l.natureId)) {
			return echec('reference_inactive', { champ: `lignes.${i}.natureId` });
		}
		if (l.actionId === null) continue;
		const action = r.actions.find((a) => a.id === l.actionId);
		if (action === undefined) return echec('element_introuvable');
		if (!action.actif && !existant.actionIds.includes(l.actionId)) {
			return echec('reference_inactive', { champ: `lignes.${i}.actionId` });
		}
	}
	return succes(true);
}

export function validerOperation(
	b: Brouillon,
	r: ReferencesSaisie,
	existant: ExistantLignes = AUCUN
): Resultat<BrouillonValide> {
	const forme = controlerForme(b);
	if (!forme.ok) return forme;

	// O1 : somme des Côtés = somme des Lignes. Un Mouvement interne vaut 0 des deux côtés.
	const difference = somme(b.cotes) - somme(b.lignes);
	if (difference !== 0) {
		return echec('ventilation_incomplete', {
			montant: formaterMontant(centimes(Math.abs(difference)))
		});
	}

	const dates = controlerDates(b, r);
	if (!dates.ok) return dates;

	const courant = exerciceDeDate(r.exercices, b.date) as Exercice;
	const lignes = controlerRattachements(b, r, courant);
	if (!lignes.ok) return lignes;

	const references = controlerReferences(b, r, existant);
	if (!references.ok) return references;

	return succes({ ...b, lignes: lignes.valeur });
}
