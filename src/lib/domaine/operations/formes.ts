/** Formes d'Opération (SCHEMA-DONNEES §7) : d'une intention, sans signe à saisir, à un brouillon. */
import { centimes, type Centimes } from '../montant.ts';
import type { DateCivile } from '../dates.ts';
import type { ModePaiement } from '../journal.ts';
import type { Brouillon, LigneSaisie } from './validation.ts';

export type Intention = 'depense' | 'recette';

export type EnTeteSaisie = {
	libelle: string;
	reference: string | null;
	modePaiement: ModePaiement | null;
	note: string | null;
	tiers: string | null;
	/** Pas besoin de Pièce (FR-27). Absent : la Pièce reste attendue. */
	sansPiece?: boolean;
};

export type LigneVentilee = {
	/** Positif : le sens vient de l'intention et de `contraire`. */
	montant: Centimes;
	contraire: boolean;
	/** Recette qui réduit une dépense (FR-8) : rangée en Dépense par `colonneDe`. */
	reduction: boolean;
	natureId: number;
	actionId: number | null;
	exerciceRattachementId: number | null;
	note: string | null;
};

export type SaisieStandard = EnTeteSaisie & {
	intention: Intention;
	compteId: number;
	date: DateCivile;
	montant: Centimes;
	lignes: LigneVentilee[];
};

function opposer(c: Centimes): Centimes {
	return centimes(-c);
}

/**
 * Une Ligne de recette dans une Dépense réduit la dépense (`est_reduction`, FR-8).
 * Une Ligne de dépense dans une Recette reste une vraie dépense, comme des frais.
 */
export function ligneDeSaisie(l: LigneVentilee, intention: Intention): LigneSaisie {
	const entrante = intention === 'recette' ? !l.contraire : l.contraire;
	return {
		montant: entrante ? l.montant : opposer(l.montant),
		estReduction: intention === 'depense' ? l.contraire : !l.contraire && l.reduction,
		natureId: l.natureId,
		actionId: l.actionId,
		exerciceRattachementId: l.exerciceRattachementId,
		note: l.note
	};
}

export function formeStandard(s: SaisieStandard): Brouillon {
	return {
		genre: 'standard',
		origine: 'saisie',
		date: s.date,
		libelle: s.libelle,
		reference: s.reference,
		modePaiement: s.modePaiement,
		note: s.note,
		tiers: s.tiers,
		// Un versement SumUp porte des frais, mais ce n'est pas une dépense à justifier (FR-24).
		sansPiece: (s.sansPiece ?? false) || (s.modePaiement === 'sumup' && s.intention === 'recette'),
		cotes: [
			{
				compteId: s.compteId,
				date: s.date,
				montant: s.intention === 'depense' ? opposer(s.montant) : s.montant
			}
		],
		lignes: s.lignes.map((l) => ligneDeSaisie(l, s.intention))
	};
}

export type SaisieInterne = {
	libelle: string;
	note: string | null;
	reference: string | null;
	deId: number;
	versId: number;
	montant: Centimes;
	parti: DateCivile;
	arrive: DateCivile;
};

/** Deux Côtés opposés, chacun à sa date. La date de l'Opération est celle du Côté sortant (O3). */
export function formeInterne(s: SaisieInterne): Brouillon {
	return {
		genre: 'interne',
		origine: 'saisie',
		date: s.parti,
		libelle: s.libelle,
		reference: s.reference,
		modePaiement: null,
		note: s.note,
		tiers: null,
		sansPiece: false,
		cotes: [
			{ compteId: s.deId, date: s.parti, montant: opposer(s.montant) },
			{ compteId: s.versId, date: s.arrive, montant: s.montant }
		],
		lignes: []
	};
}

export type LigneCompensee = {
	natureId: number;
	actionId: number | null;
	exerciceRattachementId?: number | null;
};

export type SaisieCompensee = EnTeteSaisie & {
	compteId: number;
	date: DateCivile;
	facture: Centimes;
	ventes: Centimes;
	ligneFacture: LigneCompensee;
	ligneVentes: LigneCompensee;
};

/** Différentiel : ce qui touche réellement le Compte. Positif si les ventes dépassent la facture. */
export function differentiel(ventes: Centimes, facture: Centimes): Centimes {
	return centimes(ventes - facture);
}

/** Une Ligne de ventes, une Ligne de facture, et un seul Côté : le différentiel, ou aucun. */
export function formeCompensee(s: SaisieCompensee): Brouillon {
	const ecart = differentiel(s.ventes, s.facture);
	return {
		genre: 'compensee',
		origine: 'saisie',
		date: s.date,
		libelle: s.libelle,
		reference: s.reference,
		modePaiement: s.modePaiement,
		note: s.note,
		tiers: s.tiers,
		sansPiece: s.sansPiece ?? false,
		cotes: ecart === 0 ? [] : [{ compteId: s.compteId, date: s.date, montant: ecart }],
		lignes: [
			{
				montant: s.ventes,
				estReduction: false,
				natureId: s.ligneVentes.natureId,
				actionId: s.ligneVentes.actionId,
				exerciceRattachementId: s.ligneVentes.exerciceRattachementId ?? null,
				note: null
			},
			{
				montant: opposer(s.facture),
				estReduction: false,
				natureId: s.ligneFacture.natureId,
				actionId: s.ligneFacture.actionId,
				exerciceRattachementId: s.ligneFacture.exerciceRattachementId ?? null,
				note: null
			}
		]
	};
}
