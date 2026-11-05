/**
 * Factures émises (AD-12, F3 à F5). Une Facture ou un Avoir ne produit aucune Ligne : seule
 * l'Opération d'encaissement touche résultat et trésorerie. Le total se calcule, rien n'est stocké.
 */
import { formaterDateLongue, type DateCivile, type Instant } from '../dates.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type { Exercice } from '../exercices.ts';
import { centimes, formaterMontant, MONTANT_MAX, type Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

export type LigneFacture = { designation: string; quantite: number; prixUnitaire: Centimes };

/** Ce qu'un brouillon laisse modifier. */
export type EntreeFacture = {
	tiersNom: string;
	tiersAdresse: string;
	dateEmission: DateCivile | null;
	actionId: number | null;
	lignes: LigneFacture[];
};

/** Émetteur et mentions, copiés à la validation : changer les Réglages ne touche plus au document. */
export type IdentiteFacture = { nom: string; adresse: string; mentions: string };

export type TypeFacture = 'facture' | 'avoir';

export type Facture = EntreeFacture & {
	id: number;
	type: TypeFacture;
	numero: string | null;
	avoirDeId: number | null;
	identite: IdentiteFacture | null;
	fichierSha256: string | null;
	valideLe: Instant | null;
	creeLe: Instant;
};

export type CompteurFacture = { annee: number; dernier: number; derniereDate: DateCivile };

export const montantLigne = (l: Pick<LigneFacture, 'quantite' | 'prixUnitaire'>) =>
	centimes(l.quantite * l.prixUnitaire);

export function totalFacture(lignes: readonly LigneFacture[]): Centimes {
	return centimes(lignes.reduce((total, l) => total + l.quantite * l.prixUnitaire, 0));
}

const anneeDe = (date: DateCivile) => Number(date.slice(0, 4));

/** Dernière date émise, toutes années confondues : la suite reste chronologique d'une année à l'autre. */
function derniereDate(compteurs: readonly CompteurFacture[]): DateCivile | null {
	return (
		compteurs
			.map((c) => c.derniereDate)
			.sort()
			.at(-1) ?? null
	);
}

export type NumeroAttribue = { numero: string; annee: number; rang: number };

/** F3 : `AAAA-NNN`, suite commune aux Factures et aux Avoirs, qui repart à 1 chaque année civile. */
export function numeroSuivant(
	compteurs: readonly CompteurFacture[],
	date: DateCivile
): NumeroAttribue {
	const annee = anneeDe(date);
	const rang = (compteurs.find((c) => c.annee === annee)?.dernier ?? 0) + 1;
	return { numero: `${annee}-${String(rang).padStart(3, '0')}`, annee, rang };
}

export type ContexteNumero = {
	aujourdhui: DateCivile;
	exercices: readonly Exercice[];
	compteurs: readonly CompteurFacture[];
};

/**
 * Une date émise tient tout ce qui la suit : une date à venir bloquerait donc la suite jusqu'à ce
 * jour. Elle tombe dans un Exercice ouvert, parce qu'elle y fait naître une Créance.
 */
function controlerDateEmission(date: DateCivile, c: ContexteNumero): Resultat<NumeroAttribue> {
	if (date > c.aujourdhui) return echec('facture_date_future', { champ: 'dateEmission' });
	const exercice = exerciceDeDate(c.exercices, date);
	if (exercice?.statut === 'cloture') {
		return echec('exercice_cloture', { exercice: exercice.libelle, champ: 'dateEmission' });
	}
	if (exercice?.statut !== 'ouvert') {
		return echec('date_hors_exercice', { champ: 'dateEmission' });
	}
	const derniere = derniereDate(c.compteurs);
	if (derniere !== null && date < derniere) {
		return echec('facture_date_anterieure', { champ: 'dateEmission' });
	}
	return succes(numeroSuivant(c.compteurs, date));
}

export type DecisionValidation = NumeroAttribue & { date: DateCivile; total: Centimes };

/** F3 : ce qui se vérifie avant de consommer un numéro. Un refus ne laisse aucun trou. */
export function deciderValidation(
	f: Pick<Facture, 'valideLe' | 'tiersNom' | 'dateEmission' | 'lignes'>,
	c: ContexteNumero
): Resultat<DecisionValidation> {
	if (f.valideLe !== null) return echec('facture_validee');
	if (f.tiersNom.trim() === '') return echec('facture_incomplete', { champ: 'tiersNom' });
	if (f.dateEmission === null) return echec('facture_incomplete', { champ: 'dateEmission' });
	const total = totalFacture(f.lignes);
	if (total <= 0) return echec('facture_sans_montant');
	if (total > MONTANT_MAX) return echec('montant_invalide');
	const numero = controlerDateEmission(f.dateEmission, c);
	return numero.ok ? succes({ ...numero.valeur, date: f.dateEmission, total }) : numero;
}

export type DecisionAvoir = NumeroAttribue & {
	date: DateCivile;
	total: Centimes;
	/** Reste dû annulé, Dette à ouvrir : à eux deux, ils couvrent toute la Facture (F5). */
	resteAnnule: Centimes;
	detteOuverte: Centimes;
};

/** F5 : un Avoir couvre toute sa Facture, daté du jour où il est confirmé. */
export function deciderAvoir(
	f: Pick<Facture, 'type' | 'numero' | 'lignes'>,
	dejaAnnulee: boolean,
	encaisse: Centimes,
	c: ContexteNumero
): Resultat<DecisionAvoir> {
	if (f.type !== 'facture' || f.numero === null) return echec('element_introuvable');
	if (dejaAnnulee) return echec('facture_deja_annulee');
	const numero = controlerDateEmission(c.aujourdhui, c);
	if (!numero.ok) return numero;
	const total = totalFacture(f.lignes);
	return succes({
		...numero.valeur,
		date: c.aujourdhui,
		total,
		resteAnnule: centimes(total - encaisse),
		detteOuverte: encaisse
	});
}

export const motifFacture = (numero: string) => `Facture n° ${numero}`;
export const motifAvoir = (numero: string) => `Avoir n° ${numero}`;

export type EtatFacture = 'brouillon' | 'validee' | 'annulee' | 'avoir';

export const LIBELLES_ETAT: Readonly<Record<EtatFacture, string>> = {
	brouillon: 'Brouillon',
	validee: 'Validée',
	annulee: 'Annulée',
	avoir: 'Avoir'
};

export type RangeeFacture = {
	id: number;
	numero: string | null;
	tiers: string;
	date: DateCivile | null;
	/** Négatif pour un Avoir : il retire ce que sa Facture a porté. */
	montant: Centimes;
	etat: EtatFacture;
	/** Suite de l'état, après une virgule : encaissement, ou document lié. */
	detail: string | null;
};

export type EncaissementFacture = { reste: Centimes; encaisse: Centimes };

export function detailEncaissement(e: EncaissementFacture): string {
	if (e.reste === 0) return 'encaissée';
	return e.encaisse > 0 ? `reste ${formaterMontant(e.reste)}` : 'à encaisser';
}

export function phraseOrigine(origine: Pick<Facture, 'numero' | 'dateEmission'>): string {
	const date = origine.dateEmission;
	const du = date === null ? '' : ` du ${formaterDateLongue(date)}`;
	return `Annule la facture n° ${origine.numero ?? ''}${du}.`;
}

/** Les brouillons d'abord, puis la suite du plus récent au plus ancien. */
export function rangerFactures<T extends { numero: string | null; id: number }>(
	liste: readonly T[]
): T[] {
	const brouillons = liste.filter((f) => f.numero === null).sort((a, b) => b.id - a.id);
	const emises = liste
		.filter((f) => f.numero !== null)
		.sort((a, b) => (b.numero as string).localeCompare(a.numero as string));
	return [...brouillons, ...emises];
}

/** F3 : aucun numéro ne manque ni ne se répète, année par année. Rend les anomalies lisibles. */
export function controlerSuite(
	factures: readonly Pick<Facture, 'numero'>[],
	compteurs: readonly CompteurFacture[]
): string[] {
	const parAnnee = new Map<number, number[]>();
	for (const f of factures) {
		if (f.numero === null) continue;
		const [annee, rang] = f.numero.split('-').map(Number) as [number, number];
		parAnnee.set(annee, [...(parAnnee.get(annee) ?? []), rang]);
	}
	const annees = new Set([...parAnnee.keys(), ...compteurs.map((c) => c.annee)]);
	return [...annees].flatMap((annee) => {
		const rangs = [...(parAnnee.get(annee) ?? [])].sort((a, b) => a - b);
		const dernier = compteurs.find((c) => c.annee === annee)?.dernier ?? 0;
		const suivie = rangs.length === dernier && rangs.every((r, i) => r === i + 1);
		return suivie ? [] : [`La suite des numéros de ${annee} présente un trou ou un doublon.`];
	});
}
