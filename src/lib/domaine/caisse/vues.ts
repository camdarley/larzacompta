/** Formes de lecture des caisses, partagées par l'application et l'interface (AD-1). */
import type { DateCivile, Instant } from '../dates.ts';
import type { ComptageJ, CoupureJ, GrandJournal, OperationJ, TypeComptage } from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import type { Action, Compte } from '../parametrage.ts';
import {
	comptageDe,
	cotesDeSession,
	dateSession,
	deciderReouverture,
	mouvementsDepuisRepere,
	repereCaisse,
	sessionDe,
	sessionOuverte,
	soldeCourantCaisse,
	termesRecette,
	totalComptage,
	type TermesRecette
} from './index.ts';

import { cotesARattacher, recettesARevoir } from './saisie.ts';

type Noms = { comptes: readonly Compte[]; actions: readonly Pick<Action, 'id' | 'libelle'>[] };

const nomAction = (n: Noms, id: number | null) =>
	n.actions.find((a) => a.id === id)?.libelle ?? null;

export type SessionEnCours = {
	id: number;
	action: string | null;
	depuis: DateCivile | null;
	comptageFinal: boolean;
};

function enCours(j: GrandJournal, n: Noms, compteId: number): SessionEnCours | null {
	const s = sessionOuverte(j, compteId);
	if (s === undefined) return null;
	return {
		id: s.id,
		action: nomAction(n, s.actionId),
		depuis: dateSession(j, s.id),
		comptageFinal: comptageDe(j, s.id, 'fin') !== undefined
	};
}

export type CarteCaisse = {
	id: number;
	libelle: string;
	reserve: boolean;
	solde: Centimes;
	dernierComptage: DateCivile | null;
	session: SessionEnCours | null;
	/** Session clôturée dont un mouvement arrivé ensuite attend de revoir la Recette. */
	recetteARevoir: number | null;
};

export function carteCaisse(j: GrandJournal, n: Noms, c: Compte, jour: DateCivile): CarteCaisse {
	const repere = repereCaisse(j, c.id, { jour });
	return {
		id: c.id,
		libelle: c.libelle,
		reserve: c.reserve,
		solde: soldeCourantCaisse(j, c.id, { jour }),
		dernierComptage: repere?.date ?? null,
		session: enCours(j, n, c.id),
		recetteARevoir: recettesARevoir(j).find((r) => r.compteId === c.id)?.sessionId ?? null
	};
}

/** Une caisse désactivée et vide ne dit plus rien. */
export function cartesCaisses(j: GrandJournal, n: Noms, jour: DateCivile) {
	const cartes = n.comptes
		.filter((c) => c.type === 'caisse')
		.map((c) => ({ compte: c, carte: carteCaisse(j, n, c, jour) }))
		.filter(({ compte, carte }) => compte.actif || carte.solde !== 0)
		.map(({ carte }) => carte);
	return { total: sommeCentimes(cartes.map((c) => c.solde)), cartes };
}

export type TypeEvenement = 'comptage' | 'recette' | 'ecart' | 'depense' | 'entree' | 'transfert';

export type EvenementFrise = {
	cle: string;
	date: DateCivile;
	type: TypeEvenement;
	libelle: string;
	/** Compté pour un Comptage, signé pour un mouvement. */
	montant: Centimes;
	operationId: number | null;
	sessionId: number | null;
	/** Pour trier un même jour : un Comptage se situe à son instant. */
	instant: Instant;
};

export const LIBELLES_COMPTAGE: Record<TypeComptage, string> = {
	ouverture: 'Comptage d’ouverture',
	fin: 'Comptage final',
	controle: 'Comptage de contrôle'
};

function typeDeMouvement(op: OperationJ, montant: Centimes): TypeEvenement {
	if (op.origine === 'recette_especes') return 'recette';
	if (op.origine === 'ecart_caisse') return 'ecart';
	if (op.genre === 'interne') return 'transfert';
	return montant < 0 ? 'depense' : 'entree';
}

/** Comptages, Recettes d'espèces, dépenses, transferts et Écarts de caisse (FR-43), du plus récent. */
export function friseCaisse(j: GrandJournal, compteId: number): EvenementFrise[] {
	const comptages: EvenementFrise[] = j.comptages
		.filter((c) => c.compteId === compteId)
		.map((c) => ({
			cle: `c${c.id}`,
			date: c.date,
			type: 'comptage',
			libelle: LIBELLES_COMPTAGE[c.type],
			montant: totalComptage(c.coupures),
			operationId: null,
			sessionId: c.sessionCaisseId,
			instant: c.compteLe
		}));
	const mouvements: EvenementFrise[] = j.operations.flatMap((op) =>
		op.cotes
			.filter((c) => c.compteId === compteId)
			.map((c) => ({
				cle: `o${c.id}`,
				date: c.date,
				type: typeDeMouvement(op, c.montant),
				libelle: op.libelle,
				montant: c.montant,
				operationId: op.id,
				sessionId: c.sessionCaisseId ?? null,
				instant: op.creeLe
			}))
	);
	return [...comptages, ...mouvements].sort(
		(a, b) => b.date.localeCompare(a.date) || b.instant.localeCompare(a.instant)
	);
}

export type FriseParDate = { date: DateCivile; evenements: EvenementFrise[] };

export function friseParDate(frise: readonly EvenementFrise[]): FriseParDate[] {
	const groupes: FriseParDate[] = [];
	for (const e of frise) {
		const dernier = groupes.at(-1);
		if (dernier?.date === e.date) dernier.evenements.push(e);
		else groupes.push({ date: e.date, evenements: [e] });
	}
	return groupes;
}

export type DetailCaisse = {
	carte: CarteCaisse;
	/** Addition posée depuis le dernier Comptage. Nulle tant que rien n'a été compté. */
	pose: {
		date: DateCivile;
		depart: Centimes;
		source: 'comptage' | 'constat';
		entrees: Centimes;
		sorties: Centimes;
	} | null;
	frise: FriseParDate[];
};

export function detailCaisse(j: GrandJournal, n: Noms, c: Compte, jour: DateCivile): DetailCaisse {
	const { repere, mouvements } = mouvementsDepuisRepere(j, c.id, { jour });
	const montants = mouvements.map((m) => m.cote.montant);
	return {
		carte: carteCaisse(j, n, c, jour),
		pose:
			repere === undefined
				? null
				: {
						date: repere.date,
						depart: repere.total,
						source: repere.source,
						entrees: sommeCentimes(montants.filter((m) => m > 0)),
						sorties: centimes(Math.abs(sommeCentimes(montants.filter((m) => m < 0))))
					},
		frise: friseParDate(friseCaisse(j, c.id))
	};
}

export type LigneComptage = {
	id: number;
	type: TypeComptage;
	date: DateCivile;
	total: Centimes;
	coupures: CoupureJ[];
	ecart: Centimes | null;
};

export type MouvementSession = {
	operationId: number;
	date: DateCivile;
	libelle: string;
	montant: Centimes;
	/** Autre Compte d'un transfert ou d'un dépôt. */
	autreCompte: string | null;
};

export type VueSession = {
	id: number;
	compteId: number;
	caisse: string;
	action: { id: number; libelle: string } | null;
	ouverte: boolean;
	depuis: DateCivile | null;
	cloturee: Instant | null;
	comptages: LigneComptage[];
	depenses: MouvementSession[];
	transferts: MouvementSession[];
	apres: MouvementSession[];
	termes: TermesRecette | null;
	recetteOperationId: number | null;
	peutRouvrir: boolean;
	/** Datés dans la Session, saisis après sa clôture : sa Recette ne les a pas comptés. */
	aRattacher: MouvementSession[];
};

function ligneComptage(j: GrandJournal, c: ComptageJ): LigneComptage {
	const op = j.operations.find((o) => o.id === c.operationEcartId);
	return {
		id: c.id,
		type: c.type,
		date: c.date,
		total: totalComptage(c.coupures),
		coupures: c.coupures,
		ecart: op === undefined ? null : sommeCentimes(op.cotes.map((x) => x.montant))
	};
}

export function vueSession(j: GrandJournal, n: Noms, sessionId: number): VueSession | null {
	const s = sessionDe(j, sessionId);
	if (s === undefined) return null;
	const nomCompte = (id: number | undefined) => n.comptes.find((c) => c.id === id)?.libelle ?? null;
	const lignes = (phase: 'pendant' | 'apres_comptage') =>
		cotesDeSession(j, s.id, phase).map(({ cote, operation }) => ({
			operationId: operation.id,
			date: cote.date,
			libelle: operation.libelle,
			montant: cote.montant,
			autreCompte:
				operation.genre === 'interne'
					? nomCompte(operation.cotes.find((c) => c.id !== cote.id)?.compteId)
					: null,
			interne: operation.genre === 'interne'
		}));
	const pendant = lignes('pendant');
	const sans = ({ interne: _, ...m }: (typeof pendant)[number]): MouvementSession => m;
	const libelle = nomAction(n, s.actionId);
	const types: TypeComptage[] = ['ouverture', 'fin'];
	return {
		id: s.id,
		compteId: s.compteId,
		caisse: nomCompte(s.compteId) ?? '',
		action: s.actionId !== null && libelle !== null ? { id: s.actionId, libelle } : null,
		ouverte: s.clotureeLe === null,
		depuis: dateSession(j, s.id),
		cloturee: s.clotureeLe,
		comptages: types.flatMap((t) =>
			j.comptages
				.filter((c) => c.sessionCaisseId === s.id && c.type === t)
				.map((c) => ligneComptage(j, c))
		),
		depenses: pendant.filter((m) => !m.interne).map(sans),
		transferts: pendant.filter((m) => m.interne).map(sans),
		apres: lignes('apres_comptage').map(sans),
		termes: termesRecette(j, s.id),
		recetteOperationId: s.operationRecetteId,
		peutRouvrir: deciderReouverture(j, s.id).ok,
		aRattacher:
			s.clotureeLe === null || !deciderReouverture(j, s.id).ok
				? []
				: cotesARattacher(j, s).map(({ cote, operation }) => ({
						operationId: operation.id,
						date: cote.date,
						libelle: operation.libelle,
						montant: cote.montant,
						autreCompte: null
					}))
	};
}

export type LigneSessionAction = {
	id: number;
	caisse: string;
	date: DateCivile | null;
	ouverte: boolean;
	recette: Centimes | null;
};

/** Sessions d'une Action, datées dans l'Exercice regardé. */
export function sessionsDeLAction(
	j: GrandJournal,
	n: Noms,
	actionId: number,
	debut: DateCivile,
	fin: DateCivile
): LigneSessionAction[] {
	return j.sessions
		.filter((s) => s.actionId === actionId)
		.flatMap((s) => {
			const date = dateSession(j, s.id);
			if (date === null || date < debut || date > fin) return [];
			return [
				{
					id: s.id,
					caisse: n.comptes.find((c) => c.id === s.compteId)?.libelle ?? '',
					date,
					ouverte: s.clotureeLe === null,
					recette: termesRecette(j, s.id)?.recette ?? null
				}
			];
		});
}

export type RangeeMesCaisses = {
	compteId: number;
	libelle: string;
	reserve: boolean;
	ouverte: boolean;
	action: string | null;
	sessionId: number | null;
	comptageFinal: boolean;
};

/** Aucun chiffre : ni solde, ni total, pas même celui de cette caisse. */
export function rangeeMesCaisses(j: GrandJournal, n: Noms, c: Compte): RangeeMesCaisses {
	const s = enCours(j, n, c.id);
	return {
		compteId: c.id,
		libelle: c.libelle,
		reserve: c.reserve,
		ouverte: s !== null,
		action: s?.action ?? null,
		sessionId: s?.id ?? null,
		comptageFinal: s?.comptageFinal ?? false
	};
}

export type ModeComptage = 'ouverture' | 'controle' | 'fin';

export type EcranComptage = {
	mode: ModeComptage;
	/** Une correction part du Comptage déjà enregistré, et rejoue la comparaison (C11). */
	correction: boolean;
	compteId: number;
	sessionId: number | null;
	caisse: string;
	action: string | null;
	quantites: CoupureJ[];
	message: 'repris' | 'a_compter' | null;
	/** Ouverture : les Actions « avec caisse ». */
	actions: { id: number; libelle: string }[];
	date: DateCivile;
	aujourdhui: DateCivile;
	/** Inventaire : Comptage de contrôle d'une caisse ordinaire, sans Session (FR-16 élargi). */
	inventaire?: boolean;
	/**
	 * Un Comptage précédent se reprend d'un geste : l'ouverture au Comptage final, le dernier
	 * Comptage à l'inventaire. On vérifie la caisse et on corrige les pièces sorties.
	 */
	reprise?: {
		source: 'ouverture' | 'dernier';
		date: DateCivile;
		total: Centimes;
		coupures: CoupureJ[];
	} | null;
};
