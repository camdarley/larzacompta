/**
 * C1 à C12, rejoués par `ape verifier` sur la base telle qu'elle est. C3, C9 et C10 ne laissent
 * aucune trace à relire : le Fond n'est stocké nulle part, le recomptage est sans état, et une
 * recette attendue n'est jamais écrite. Leur preuve est dans les tests d'application.
 */
import type { GrandJournal, OperationJ } from '../journal.ts';
import { comptageDe, dateSession, phaseDuCote, termesRecette } from './index.ts';

type Violation = { invariant: string; message: string };

function violationsSession(j: GrandJournal): Violation[] {
	const v: Violation[] = [];
	const ouvertes = new Map<number, number>();
	for (const s of j.sessions) {
		const nom = `Session ${s.id}`;
		const compte = j.comptes.find((c) => c.id === s.compteId);
		if (compte?.type !== 'caisse' || compte.reserve) {
			v.push({ invariant: 'C1', message: `${nom} : sur un Compte qui n'en porte pas.` });
		}
		if (s.clotureeLe === null) ouvertes.set(s.compteId, (ouvertes.get(s.compteId) ?? 0) + 1);
		if (comptageDe(j, s.id, 'ouverture') === undefined) {
			v.push({ invariant: 'C2', message: `${nom} : sans Comptage d'ouverture.` });
		}
		if (s.clotureeLe !== null && comptageDe(j, s.id, 'fin') === undefined) {
			v.push({ invariant: 'C2', message: `${nom} : clôturée sans Comptage final.` });
		}
	}
	for (const [compteId, n] of ouvertes) {
		if (n > 1) v.push({ invariant: 'C1', message: `Compte ${compteId} : ${n} Sessions ouvertes.` });
	}
	return v;
}

const montantDe = (op: OperationJ) => op.cotes.reduce((n, c) => n + c.montant, 0);

function violationsRecettes(j: GrandJournal): Violation[] {
	const v: Violation[] = [];
	for (const s of j.sessions.filter((x) => x.clotureeLe !== null)) {
		const nom = `Session ${s.id}`;
		const termes = termesRecette(j, s.id);
		if (termes === null) continue;
		const op = j.operations.find((o) => o.id === s.operationRecetteId);
		if (s.operationRecetteId !== null && op === undefined) {
			v.push({ invariant: 'C7', message: `${nom} : clôturée, sa recette est annulée.` });
		}
		if ((op === undefined ? 0 : montantDe(op)) !== termes.recette) {
			v.push({ invariant: 'C5', message: `${nom} : la recette ne suit pas la formule.` });
		}
		if (op && op.date !== comptageDe(j, s.id, 'fin')?.date) {
			v.push({ invariant: 'C6', message: `${nom} : recette mal datée.` });
		}
	}
	return v;
}

function violationsEcarts(j: GrandJournal): Violation[] {
	return j.comptages.flatMap((c) => {
		if (c.operationEcartId === null) return [];
		const op = j.operations.find((o) => o.id === c.operationEcartId);
		const valide = op?.origine === 'ecart_caisse' && op.date === c.date;
		return valide
			? []
			: [{ invariant: 'C8', message: `Comptage ${c.id} : son Écart de caisse ne le suit pas.` }];
	});
}

/**
 * Une Session rouverte a eu une pause dont aucune date ne reste : ce qui s'y est saisi est hors
 * Session à juste titre, C12 ne se juge plus. Un Côté daté avant l'ouverture n'y entre jamais.
 */
function couverteParUneSession(
	j: GrandJournal,
	op: OperationJ,
	c: OperationJ['cotes'][number],
	rouvertes: ReadonlySet<number>
): boolean {
	return j.sessions.some((s) => {
		const ouverture = dateSession(j, s.id);
		return (
			s.compteId === c.compteId &&
			op.origine === 'saisie' &&
			!rouvertes.has(s.id) &&
			op.creeLe > s.ouverteLe &&
			(s.clotureeLe === null || op.creeLe < s.clotureeLe) &&
			ouverture !== null &&
			c.date >= ouverture
		);
	});
}

function phaseContraire(j: GrandJournal, sessionId: number, c: OperationJ['cotes'][number]) {
	const lue = c.sessionPhase ?? undefined;
	if (lue === undefined) return false;
	const finale = comptageDe(j, sessionId, 'fin')?.date ?? null;
	return phaseDuCote(c.date, finale, lue, lue) !== lue;
}

function violationsCotes(j: GrandJournal, rouvertes: ReadonlySet<number>): Violation[] {
	const v: Violation[] = [];
	for (const op of j.operations) {
		const nom = `Opération ${op.id}`;
		for (const c of op.cotes) {
			if (c.sessionCaisseId === null || c.sessionCaisseId === undefined) {
				if (couverteParUneSession(j, op, c, rouvertes))
					v.push({ invariant: 'C12', message: `${nom} : hors de la Session ouverte.` });
				continue;
			}
			const session = j.sessions.find((s) => s.id === c.sessionCaisseId);
			if (session?.compteId !== c.compteId || !c.sessionPhase) {
				v.push({ invariant: 'C4', message: `${nom} : Côté mal rattaché à sa Session.` });
			}
			if (phaseContraire(j, c.sessionCaisseId, c)) {
				v.push({ invariant: 'C12', message: `${nom} : phase contraire à sa date.` });
			}
			if (op.origine === 'recette_especes' || op.origine === 'ecart_caisse') {
				v.push({ invariant: 'C4', message: `${nom} : ne devrait porter aucune Session.` });
			}
		}
	}
	return v;
}

export function violationsCaisses(
	j: GrandJournal,
	rouvertes: ReadonlySet<number> = new Set()
): Violation[] {
	return [
		...violationsSession(j),
		...violationsRecettes(j),
		...violationsEcarts(j),
		...violationsCotes(j, rouvertes)
	];
}
