/**
 * Caisses (AD-10, SCHEMA-DONNEES C1 à C12 et §8). Le total d'un Comptage, le Fond de caisse, la
 * Recette d'espèces et le solde courant se calculent toujours depuis le grand journal (AD-4).
 */
import type { DateCivile, Instant } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import { exerciceDeDate } from '../etats/soldes.ts';
import type {
	ComptageJ,
	Constat,
	CoteJ,
	CoupureJ,
	GrandJournal,
	OperationJ,
	PhaseSession,
	SessionJ
} from '../journal.ts';
import { centimes, formaterMontant, sommeCentimes, type Centimes } from '../montant.ts';
import type { Ancre } from '../parametrage.ts';
import { echec, succes, type Resultat } from '../resultat.ts';

/** Du plus grand au plus petit. 500 et 200 € se rangent dans « Autres coupures ». */
export const BILLETS: readonly Centimes[] = [10000, 5000, 2000, 1000, 500].map(centimes);
export const PIECES: readonly Centimes[] = [200, 100, 50, 20, 10, 5, 2, 1].map(centimes);
export const AUTRES_COUPURES: readonly Centimes[] = [50000, 20000].map(centimes);
export const COUPURES: readonly Centimes[] = [...AUTRES_COUPURES, ...BILLETS, ...PIECES];

export const estBillet = (c: Centimes) => c >= 500;

export function totalComptage(coupures: readonly CoupureJ[]): Centimes {
	return sommeCentimes(coupures.map((c) => centimes(c.coupure * c.quantite)));
}

/** Coupures à enregistrer : une quantité nulle ne dit rien de plus qu'une rangée vide. */
export function coupuresSaisies(quantites: ReadonlyMap<Centimes, number>): CoupureJ[] {
	return COUPURES.flatMap((coupure) => {
		const quantite = quantites.get(coupure) ?? 0;
		return quantite > 0 ? [{ coupure, quantite }] : [];
	});
}

export type JournalCaisse = Pick<
	GrandJournal,
	'ancres' | 'operations' | 'constats' | 'comptages' | 'sessions'
>;

export const sessionDe = (j: Pick<GrandJournal, 'sessions'>, id: number): SessionJ | undefined =>
	j.sessions.find((s) => s.id === id);

export const sessionOuverte = (
	j: Pick<GrandJournal, 'sessions'>,
	compteId: number
): SessionJ | undefined => j.sessions.find((s) => s.compteId === compteId && s.clotureeLe === null);

export const derniereSession = (
	j: Pick<GrandJournal, 'sessions'>,
	compteId: number
): SessionJ | undefined =>
	j.sessions
		.filter((s) => s.compteId === compteId)
		.sort((a, b) => a.id - b.id)
		.at(-1);

export const comptageDe = (
	j: Pick<GrandJournal, 'comptages'>,
	sessionId: number,
	type: 'ouverture' | 'fin'
): ComptageJ | undefined =>
	j.comptages.find((c) => c.sessionCaisseId === sessionId && c.type === type);

/** C3 : le total du Comptage d'ouverture, jamais une copie. */
export function fondDeCaisse(j: Pick<GrandJournal, 'comptages'>, sessionId: number): Centimes {
	const ouverture = comptageDe(j, sessionId, 'ouverture');
	return ouverture ? totalComptage(ouverture.coupures) : centimes(0);
}

/** Dernier Comptage de la Session : le seul qui se corrige (C11). */
export function dernierComptageSession(
	j: Pick<GrandJournal, 'comptages'>,
	sessionId: number
): ComptageJ | undefined {
	return comptageDe(j, sessionId, 'fin') ?? comptageDe(j, sessionId, 'ouverture');
}

export type CoteDeSession = { cote: CoteJ; operation: OperationJ };

export function cotesDeSession(
	j: Pick<GrandJournal, 'operations'>,
	sessionId: number,
	phase?: PhaseSession
): CoteDeSession[] {
	return j.operations.flatMap((operation) =>
		operation.cotes
			.filter(
				(c) => c.sessionCaisseId === sessionId && (phase === undefined || c.sessionPhase === phase)
			)
			.map((cote) => ({ cote, operation }))
	);
}

export type TermesRecette = {
	comptageFinal: Centimes;
	fond: Centimes;
	depenses: Centimes;
	transfertsSortants: Centimes;
	transfertsEntrants: Centimes;
	recette: Centimes;
};

/**
 * C5 : Comptage final − Fond de caisse + dépenses en espèces + transferts sortants − transferts
 * entrants. Seule la phase `pendant` compte. Une entrée `standard` vient en moins des dépenses.
 * Rien sans Comptage final : personne ne connaît la recette avant lui.
 */
export function termesRecette(
	j: Pick<GrandJournal, 'comptages' | 'operations'>,
	sessionId: number
): TermesRecette | null {
	const final = comptageDe(j, sessionId, 'fin');
	if (final === undefined) return null;
	const comptageFinal = totalComptage(final.coupures);
	const fond = fondDeCaisse(j, sessionId);
	let depenses = 0;
	let transfertsSortants = 0;
	let transfertsEntrants = 0;
	for (const { cote, operation } of cotesDeSession(j, sessionId, 'pendant')) {
		if (operation.genre !== 'interne') depenses -= cote.montant;
		else if (cote.montant < 0) transfertsSortants -= cote.montant;
		else transfertsEntrants += cote.montant;
	}
	return {
		comptageFinal,
		fond,
		depenses: centimes(depenses),
		transfertsSortants: centimes(transfertsSortants),
		transfertsEntrants: centimes(transfertsEntrants),
		recette: centimes(comptageFinal - fond + depenses + transfertsSortants - transfertsEntrants)
	};
}

export type LectureCaisse = {
	/** Lecture en fin de ce jour. */
	jour: DateCivile;
	/**
	 * Rejoue un instant passé : ce qui a été écrit après n'existait pas encore. Sauf un Côté hors
	 * Session daté d'avant ce jour : saisi en retard, il avait bien déjà bougé la caisse.
	 */
	jusqua?: Instant;
	/** Comptage en cours de correction : il ne se sert pas de repère à lui-même. */
	sauf?: number;
};

export type Repere =
	| { source: 'comptage'; date: DateCivile; total: Centimes; comptage: ComptageJ }
	| { source: 'constat'; date: DateCivile; total: Centimes; constat: Constat };

/** Dernier Comptage ou constat : le repère de `soldeCourantCaisse`. Un Comptage prime le même jour. */
export function repereCaisse(
	j: Pick<GrandJournal, 'comptages' | 'constats'>,
	compteId: number,
	m: LectureCaisse
): Repere | undefined {
	const comptages = j.comptages
		.filter(
			(c) =>
				c.compteId === compteId &&
				c.id !== m.sauf &&
				c.date <= m.jour &&
				(m.jusqua === undefined || c.compteLe <= m.jusqua)
		)
		.sort(
			(a, b) => a.date.localeCompare(b.date) || a.compteLe.localeCompare(b.compteLe) || a.id - b.id
		);
	const constats = j.constats
		.filter(
			(c) =>
				c.compteId === compteId &&
				c.date <= m.jour &&
				(m.jusqua === undefined || c.creeLe <= m.jusqua)
		)
		.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
	const comptage = comptages.at(-1);
	const constat = constats.at(-1);
	if (comptage && (constat === undefined || comptage.date >= constat.date)) {
		return {
			source: 'comptage',
			date: comptage.date,
			total: totalComptage(comptage.coupures),
			comptage
		};
	}
	return constat
		? { source: 'constat', date: constat.date, total: constat.solde, constat }
		: undefined;
}

/**
 * Recette ou Écart nés de ce Comptage : ils sont déjà dans son total. L'Écart d'ouverture de sa
 * Session aussi : il peut se recalculer après le Comptage final, le même jour, sans rien bouger.
 */
function issuDuComptage(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>,
	comptage: ComptageJ,
	operationId: number
): boolean {
	if (comptage.operationEcartId === operationId) return true;
	if (comptage.type !== 'fin' || comptage.sessionCaisseId === null) return false;
	if (comptageDe(j, comptage.sessionCaisseId, 'ouverture')?.operationEcartId === operationId) {
		return true;
	}
	return sessionDe(j, comptage.sessionCaisseId)?.operationRecetteId === operationId;
}

/**
 * Un Écart recalculé renaît avec un nouveau `creeLe`, mais il dit ce qu'a constaté son Comptage : il
 * se situe à l'instant de ce Comptage, pas à celui de son écriture.
 */
function instantEcrit(j: Pick<GrandJournal, 'comptages'>, operation: OperationJ): Instant {
	if (operation.origine !== 'ecart_caisse') return operation.creeLe;
	return j.comptages.find((c) => c.operationEcartId === operation.id)?.compteLe ?? operation.creeLe;
}

/**
 * Le Côté a-t-il bougé la caisse après le repère ? Pour un Côté de la Session du repère, seule sa
 * phase répond : une kermesse tient en un jour, et la date seule ne suffit pas.
 */
function posterieur(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>,
	r: Repere,
	operation: OperationJ,
	cote: CoteJ
): boolean {
	// Décision de la revue du jalon 1 : un constat se compare en fin de journée, la date tranche.
	if (r.source === 'constat') return cote.date > r.date;
	const { comptage } = r;
	if (comptage.sessionCaisseId !== null && cote.sessionCaisseId === comptage.sessionCaisseId) {
		return comptage.type === 'ouverture' || cote.sessionPhase === 'apres_comptage';
	}
	if (issuDuComptage(j, comptage, operation.id)) return false;
	if (cote.date !== r.date) return cote.date > r.date;
	return instantEcrit(j, operation) > comptage.compteLe;
}

function cotesPosterieurs(
	j: JournalCaisse,
	compteId: number,
	r: Repere | undefined,
	m: LectureCaisse
): CoteDeSession[] {
	return j.operations.flatMap((operation) => {
		const lu = connuLe(j, operation, m);
		return operation.cotes
			.filter(
				(c) =>
					c.compteId === compteId && lu(c) && (r === undefined || posterieur(j, r, operation, c))
			)
			.map((cote) => ({ cote, operation }));
	});
}

/** Ce que la lecture retient d'une Opération : daté d'ici là, et écrit, ou arrivé en retard. */
function connuLe(j: Pick<GrandJournal, 'comptages'>, operation: OperationJ, m: LectureCaisse) {
	const ecriteApres = m.jusqua !== undefined && instantEcrit(j, operation) > m.jusqua;
	const enRetard = (c: CoteJ) => (c.sessionCaisseId ?? null) === null && c.date < m.jour;
	return (c: CoteJ) => c.date <= m.jour && (!ecriteApres || enRetard(c));
}

const ancreDe = (ancres: readonly Ancre[], compteId: number) =>
	ancres.find((a) => a.compteId === compteId)?.solde ?? centimes(0);

/**
 * Seule lecture juste pendant une Session ouverte (§8). Sans Comptage ni constat, elle part de
 * l'ancre, comme `soldeCompte`. Après clôture de la Session, elle égale `soldeCompte`.
 */
export function soldeCourantCaisse(j: JournalCaisse, compteId: number, m: LectureCaisse): Centimes {
	const r = repereCaisse(j, compteId, m);
	const depart = r?.total ?? ancreDe(j.ancres, compteId);
	const mouvements = cotesPosterieurs(j, compteId, r, m).map((c) => c.cote.montant);
	return centimes(depart + sommeCentimes(mouvements));
}

/**
 * Solde attendu d'un Comptage d'ouverture ou de contrôle (C8, C9). Entre deux Sessions, il égale
 * `soldeCourantCaisse`, sauf quand un Côté est arrivé derrière le dernier Comptage : sans rien pour
 * le résorber, cet Écart resterait à vie. Le Comptage suivant se compare donc à `soldeCompte`, et son
 * Écart remet les deux lectures d'accord. Un constat garde sa règle : il fournit le solde attendu.
 */
export function soldeAttendu(j: JournalCaisse, compteId: number, m: LectureCaisse): Centimes {
	if (repereCaisse(j, compteId, m)?.source !== 'comptage') {
		return soldeCourantCaisse(j, compteId, m);
	}
	const mouvements = j.operations.flatMap((op) => {
		const lu = connuLe(j, op, m);
		return op.cotes.filter((c) => c.compteId === compteId && lu(c)).map((c) => c.montant);
	});
	return centimes(ancreDe(j.ancres, compteId) + sommeCentimes(mouvements));
}

/** Détail de `soldeCourantCaisse`, pour le `calcul-pose` et la frise. */
export function mouvementsDepuisRepere(
	j: JournalCaisse,
	compteId: number,
	m: LectureCaisse
): { repere: Repere | undefined; mouvements: CoteDeSession[] } {
	const repere = repereCaisse(j, compteId, m);
	return { repere, mouvements: cotesPosterieurs(j, compteId, repere, m) };
}

export type PrefillOuverture =
	{ type: 'repris'; coupures: CoupureJ[] } | { type: 'a_compter' } | { type: 'sans_repere' };

/**
 * Comptage d'ouverture : repris du dernier Comptage si rien n'a bougé. Des quantités anciennes
 * seraient fausses après un mouvement, et un constat n'a pas de coupures.
 */
export function prefillOuverture(
	j: JournalCaisse,
	compteId: number,
	jour: DateCivile
): PrefillOuverture {
	const { repere, mouvements } = mouvementsDepuisRepere(j, compteId, { jour });
	if (repere?.source !== 'comptage') return { type: 'sans_repere' };
	return mouvements.length > 0
		? { type: 'a_compter' }
		: { type: 'repris', coupures: repere.comptage.coupures };
}

/** Écart à enregistrer (C8) : total du Comptage moins solde attendu. */
export const ecartDeComptage = (total: Centimes, attendu: Centimes) => centimes(total - attendu);

/**
 * C9 : une différence ne s'enregistre qu'avec une confirmation portant le même total.
 * Sans état côté serveur : c'est le formulaire qui renvoie le total précédent.
 */
export function comparerAuSoldeAttendu(
	total: Centimes,
	attendu: Centimes,
	confirmation: Centimes | null
): Resultat<{ ecart: Centimes }> {
	const ecart = ecartDeComptage(total, attendu);
	if (ecart === 0 || confirmation === total) return succes({ ecart });
	return echec('recomptage_requis', {
		montant: formaterMontant(centimes(Math.abs(ecart))),
		sens: ecart < 0 ? 'de moins' : 'de plus',
		total
	});
}

/**
 * Phase d'un Côté rattaché (C12). Une date tranche seule si elle diffère de celle du Comptage
 * final : c'est ce qui garde `soldeCourantCaisse` égal à `soldeCompte` après clôture.
 */
export function phaseDuCote(
	dateCote: DateCivile,
	dateFinale: DateCivile | null,
	choisie: PhaseSession | undefined,
	parDefaut: PhaseSession
): PhaseSession {
	if (dateFinale === null || dateCote < dateFinale) return 'pendant';
	if (dateCote > dateFinale) return 'apres_comptage';
	return choisie ?? parDefaut;
}

/**
 * C12, AD-10 : l'arrivée ou la correction du Comptage final réécrit la phase de tout Côté dont la
 * date tranche seule. Le même jour, la phase reste celle de la réponse donnée au formulaire.
 */
export function phasesARecaler(
	j: Pick<GrandJournal, 'operations'>,
	sessionId: number,
	dateFinale: DateCivile
): { coteId: number; phase: PhaseSession }[] {
	return cotesDeSession(j, sessionId).flatMap(({ cote }) => {
		if (cote.date === dateFinale) return [];
		const phase = phaseDuCote(cote.date, dateFinale, undefined, 'pendant');
		return phase === cote.sessionPhase ? [] : [{ coteId: cote.id, phase }];
	});
}

/** C7 : la dernière Session de la caisse, dans un Exercice ouvert. */
export function deciderReouverture(
	j: Pick<GrandJournal, 'sessions' | 'comptages' | 'exercices'>,
	sessionId: number
): Resultat<SessionJ> {
	const session = sessionDe(j, sessionId);
	if (session === undefined) return echec('element_introuvable');
	if (session.clotureeLe === null) return echec('session_invalide');
	if (derniereSession(j, session.compteId)?.id !== session.id) return echec('session_invalide');
	const dates = j.comptages.filter((c) => c.sessionCaisseId === sessionId).map((c) => c.date);
	const ouverts = dates.every((d) => exerciceDeDate(j.exercices, d)?.statut === 'ouvert');
	return ouverts ? succes(session) : echec('session_invalide');
}

export type ContexteDateComptage = {
	aujourdhui: DateCivile;
	exercices: readonly Exercice[];
	/** Pas avant ce jour : le dernier Comptage de la caisse, ou l'ouverture de la Session. */
	auPlusTot: DateCivile | null;
	/** Début de l'Exercice de l'ancre du Compte (O5). */
	debutAncre: DateCivile | null;
};

/** Un Comptage se date du jour où il a eu lieu : jamais demain, jamais avant le précédent. */
export function controlerDateComptage(
	date: DateCivile,
	c: ContexteDateComptage
): Resultat<DateCivile> {
	if (date > c.aujourdhui) return echec('comptage_date_future', { champ: 'date' });
	if (c.auPlusTot !== null && date < c.auPlusTot) {
		return echec('comptage_date_anterieure', { champ: 'date' });
	}
	const exercice = exerciceDeDate(c.exercices, date);
	if (exercice?.statut !== 'ouvert' || (c.debutAncre !== null && date < c.debutAncre)) {
		return echec('date_hors_exercice', { champ: 'date' });
	}
	return succes(date);
}

/** Date de la Session : celle de son Comptage d'ouverture (E4). */
export function dateSession(
	j: Pick<GrandJournal, 'comptages'>,
	sessionId: number
): DateCivile | null {
	return comptageDe(j, sessionId, 'ouverture')?.date ?? null;
}

/** Ouverte à ce jour : sa Recette d'espèces reste à enregistrer (§8, `ecartExplique`). */
export function sessionOuverteLe(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>,
	compteId: number,
	d: DateCivile
): boolean {
	const s = sessionOuverte(j, compteId);
	if (s === undefined) return false;
	const date = dateSession(j, s.id);
	return date !== null && date <= d;
}

/** Sessions ouvertes, avec le nom de leur caisse, pour la clôture d'Exercice (E4). */
export function sessionsAClore(
	j: Pick<GrandJournal, 'sessions' | 'comptages' | 'comptes'>
): { caisse: string; date: DateCivile }[] {
	return j.sessions
		.filter((s) => s.clotureeLe === null)
		.flatMap((s) => {
			const date = dateSession(j, s.id);
			const caisse = j.comptes.find((c) => c.id === s.compteId)?.libelle;
			return date !== null && caisse !== undefined ? [{ caisse, date }] : [];
		});
}
