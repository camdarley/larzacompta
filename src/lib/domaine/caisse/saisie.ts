/** Rattachement des Côtés de caisse à leur Session, au seul point d'écriture (C4, C12). */
import type { DateCivile } from '../dates.ts';
import type { CoteJ, GrandJournal, OperationJ, PhaseSession, SessionJ } from '../journal.ts';
import type { Brouillon, CoteSaisi } from '../operations/validation.ts';
import { comptageDe, phaseDuCote, sessionDe, sessionOuverte } from './index.ts';

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
 * Un Côté neuf, ou dont le Compte, la date ou le montant change, suit la Session ouverte. Sauf s'il
 * est daté avant son Comptage d'ouverture : cette somme était déjà sortie quand on a compté le
 * Fond, elle n'entre pas dans C5. `reajusterEcartOuverture` en tire la conséquence.
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
		const horsDeLaSession = memeMouvement(existant, c) && existant?.sessionCaisseId !== session?.id;
		if (session === undefined || horsDeLaSession) return { ...c, ...lienConserve(existant, c) };
		const ouverture = comptageDe(j, session.id, 'ouverture')?.date;
		if (ouverture !== undefined && c.date < ouverture) {
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
 * La date du Comptage d'ouverture vient de changer (C12) : un Côté de la Session daté avant elle en
 * sort, comme un ticket antérieur. Un Côté saisi depuis l'ouverture et daté à partir d'elle y
 * entre. Avant le Comptage final, sa phase est `pendant` : aucune date ne dit le contraire.
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
			if (libre && c.date >= dateOuverture && op.creeLe > session.ouverteLe) {
				return [{ coteId: c.id, sessionCaisseId: session.id, sessionPhase: 'pendant' }];
			}
			return [];
		})
	);
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
};

/** Ce que le `panneau` doit savoir pour poser sa question, sans aucun chiffre. */
export function sessionsDeSaisie(
	j: Pick<GrandJournal, 'sessions' | 'comptages'>
): SessionDeSaisie[] {
	return j.sessions
		.filter((s) => s.clotureeLe === null)
		.map((s) => ({
			compteId: s.compteId,
			sessionId: s.id,
			dateFinale: comptageDe(j, s.id, 'fin')?.date ?? null
		}));
}
