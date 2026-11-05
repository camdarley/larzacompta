/** Rattachement des Côtés de caisse à leur Session, au seul point d'écriture (C4, C12). */
import type { DateCivile } from '../dates.ts';
import type { CoteJ, GrandJournal, OperationJ, PhaseSession, SessionJ } from '../journal.ts';
import type { Brouillon, CoteSaisi } from '../operations/validation.ts';
import {
	comptageDe,
	deciderReouverture,
	derniereSession,
	phaseDuCote,
	sessionDe,
	sessionOuverte,
	type CoteDeSession
} from './index.ts';

/** Réponse à la question du formulaire, par Compte : une Opération peut toucher deux caisses. */
export type PhasesChoisies = Readonly<Record<string, PhaseSession>>;

/** C4 : ces deux origines naissent d'un Comptage, et ne portent jamais de Session. */
const horsSession = (o: Brouillon['origine']) => o === 'recette_especes' || o === 'ecart_caisse';

/** Un transfert ou un dépôt part après le Comptage. Un ticket se saisit une fois payé (AD-10). */
const phaseParDefaut = (genre: Brouillon['genre']): PhaseSession =>
	genre === 'interne' ? 'apres_comptage' : 'pendant';

function lienConserve(existant: CoteJ | undefined, c: CoteSaisi) {
	return existant?.compteId === c.compteId
		? {
				sessionCaisseId: existant.sessionCaisseId ?? null,
				sessionPhase: existant.sessionPhase ?? null
			}
		: { sessionCaisseId: null, sessionPhase: null };
}

/** Le texte d'une Opération se corrige sans toucher à la caisse : rien ne la rattache alors. */
const memeMouvement = (existant: CoteJ | undefined, c: CoteSaisi) =>
	existant?.compteId === c.compteId && existant.date === c.date && existant.montant === c.montant;

/**
 * Déjà dans le Fond : saisi avant l'ouverture et daté d'elle au plus tard. Une somme sortie avant
 * qu'on compte le Fond n'entre pas dans C5, même corrigée ensuite. `reajusterEcartOuverture` en tire
 * la conséquence.
 */
function dejaDansLeFond(
	session: Pick<SessionJ, 'ouverteLe'>,
	dateOuverture: DateCivile | undefined,
	c: CoteSaisi,
	existant: CoteJ | undefined,
	avant: OperationJ | undefined
): boolean {
	if (dateOuverture === undefined) return false;
	if (c.date < dateOuverture) return true;
	return (
		c.date === dateOuverture &&
		avant !== undefined &&
		existant?.compteId === c.compteId &&
		(existant.sessionCaisseId ?? null) === null &&
		avant.creeLe <= session.ouverteLe
	);
}

/**
 * Le jour du Comptage final, après la clôture, la date ne dit pas si le ticket a été payé avant ou
 * après ce Comptage. La réponse « après » se garde sur la Session, sans toucher à C5.
 */
function sessionCloseDuJour(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>,
	c: CoteSaisi
): SessionJ | undefined {
	const session = derniereSession(j, c.compteId);
	if (session === undefined || session.clotureeLe === null) return undefined;
	return comptageDe(j, session.id, 'fin')?.date === c.date ? session : undefined;
}

/**
 * Un Côté neuf, ou dont le Compte, la date ou le montant change, suit la Session ouverte. Sauf s'il
 * est déjà dans le Fond de cette Session.
 */
export function rattacherCotes<C extends CoteSaisi>(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>,
	b: Pick<Brouillon, 'origine' | 'genre'> & { cotes: readonly C[] },
	phases: PhasesChoisies = {},
	avant?: OperationJ
): C[] {
	return b.cotes.map((c, i) => {
		const existant = avant?.cotes[i];
		if (horsSession(b.origine)) return { ...c, sessionCaisseId: null, sessionPhase: null };
		const session = sessionOuverte(j, c.compteId);
		if (session === undefined) {
			const close = sessionCloseDuJour(j, c);
			const apres = phases[String(c.compteId)] === 'apres_comptage' && b.genre !== 'interne';
			return close !== undefined && apres && (existant?.sessionCaisseId ?? null) === null
				? { ...c, sessionCaisseId: close.id, sessionPhase: 'apres_comptage' as const }
				: { ...c, ...lienConserve(existant, c) };
		}
		if (memeMouvement(existant, c) && existant?.sessionCaisseId !== session.id) {
			return { ...c, ...lienConserve(existant, c) };
		}
		const ouverture = comptageDe(j, session.id, 'ouverture')?.date;
		if (dejaDansLeFond(session, ouverture, c, existant, avant)) {
			return { ...c, sessionCaisseId: null, sessionPhase: null };
		}
		const finale = comptageDe(j, session.id, 'fin')?.date ?? null;
		const lue = existant?.compteId === c.compteId ? existant.sessionPhase : undefined;
		return {
			...c,
			sessionCaisseId: session.id,
			sessionPhase: phaseDuCote(
				c.date,
				finale,
				phases[String(c.compteId)] ?? lue ?? undefined,
				phaseParDefaut(b.genre)
			)
		};
	});
}

export type RattachementRevu = {
	coteId: number;
	sessionCaisseId: number | null;
	sessionPhase: PhaseSession | null;
};

/**
 * La date du Comptage d'ouverture vient d'être posée ou corrigée (C12) : un Côté de la Session daté
 * avant elle en sort, comme un ticket antérieur. Un Côté daté après elle y entre, quand qu'il ait
 * été saisi : le solde attendu de ce jour ne pouvait pas le contenir. Daté du jour même, il entre
 * seulement s'il est saisi depuis l'ouverture, sinon il est déjà dans le Fond. Avant le Comptage
 * final, sa phase est `pendant` : aucune date ne dit le contraire.
 */
export function rattachementsARevoir(
	j: Pick<GrandJournal, 'operations'>,
	session: Pick<SessionJ, 'id' | 'compteId' | 'ouverteLe'>,
	dateOuverture: DateCivile
): RattachementRevu[] {
	return j.operations.flatMap((op) =>
		op.cotes.flatMap((c): RattachementRevu[] => {
			if (c.compteId !== session.compteId) return [];
			const rattache = c.sessionCaisseId === session.id;
			if (rattache && c.date < dateOuverture) {
				return [{ coteId: c.id, sessionCaisseId: null, sessionPhase: null }];
			}
			const libre = (c.sessionCaisseId ?? null) === null && !horsSession(op.origine);
			const dedans =
				c.date > dateOuverture || (c.date === dateOuverture && op.creeLe > session.ouverteLe);
			return libre && dedans
				? [{ coteId: c.id, sessionCaisseId: session.id, sessionPhase: 'pendant' }]
				: [];
		})
	);
}

/**
 * Mouvements datés dans une Session clôturée, restés hors d'elle : sa Recette ne les a pas comptés.
 * Le jour du Comptage final, un transfert ou un dépôt part après lui (AD-10) : il n'y est pas.
 */
export function cotesARattacher(
	j: Pick<GrandJournal, 'operations' | 'comptages'>,
	session: Pick<SessionJ, 'id' | 'compteId' | 'ouverteLe'>
): CoteDeSession[] {
	const ouverture = comptageDe(j, session.id, 'ouverture')?.date;
	const finale = comptageDe(j, session.id, 'fin')?.date;
	if (ouverture === undefined || finale === undefined) return [];
	return j.operations.flatMap((operation) =>
		operation.cotes
			.filter(
				(c) =>
					c.compteId === session.compteId &&
					(c.sessionCaisseId ?? null) === null &&
					!horsSession(operation.origine) &&
					c.date >= ouverture &&
					c.date <= finale &&
					(c.date > ouverture || operation.creeLe > session.ouverteLe) &&
					(c.date < finale || operation.genre !== 'interne')
			)
			.map((cote) => ({ cote, operation }))
	);
}

export type RecetteARevoir = { sessionId: number; compteId: number; mouvements: CoteDeSession[] };

/** Rouvrir la Session suffit à corriger sa Recette : seule une Session qui peut l'être se signale. */
export function recettesARevoir(
	j: Pick<GrandJournal, 'sessions' | 'comptages' | 'exercices' | 'operations'>
): RecetteARevoir[] {
	return j.sessions.flatMap((s) => {
		if (s.clotureeLe === null || !deciderReouverture(j, s.id).ok) return [];
		const mouvements = cotesARattacher(j, s);
		return mouvements.length > 0 ? [{ sessionId: s.id, compteId: s.compteId, mouvements }] : [];
	});
}

/** Une Session clôturée a arrêté sa recette : ses Côtés ne bougent plus sans la rouvrir. */
export function coteFigeParSession(
	j: Pick<GrandJournal, 'sessions'>,
	avant: Pick<OperationJ, 'cotes'>,
	apres: readonly CoteSaisi[]
): boolean {
	return avant.cotes.some((c, i) => {
		if (c.sessionCaisseId === null || c.sessionCaisseId === undefined) return false;
		if (sessionDe(j, c.sessionCaisseId)?.clotureeLe === null) return false;
		const n = apres[i];
		return n?.compteId !== c.compteId || n.date !== c.date || n.montant !== c.montant;
	});
}

export type SessionDeSaisie = {
	compteId: number;
	sessionId: number;
	/** Date du Comptage final : la question du formulaire ne se pose que ce jour-là. */
	dateFinale: DateCivile | null;
	/** Dernière Session de la caisse, déjà clôturée : sa Recette est arrêtée. */
	cloturee: boolean;
};

/** Ce que le `panneau` doit savoir pour poser sa question, sans aucun chiffre. */
export function sessionsDeSaisie(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>
): SessionDeSaisie[] {
	const compteIds = [...new Set(j.sessions.map((s) => s.compteId))];
	return compteIds.flatMap((compteId) => {
		const s = derniereSession(j, compteId);
		if (s === undefined) return [];
		return [
			{
				compteId,
				sessionId: s.id,
				dateFinale: comptageDe(j, s.id, 'fin')?.date ?? null,
				cloturee: s.clotureeLe !== null
			}
		];
	});
}
