/**
 * C1 à C12, rejoués par `ape verifier` sur la base telle qu'elle est. C3, C9 et C10 ne laissent
 * aucune trace à relire : le Fond n'est stocké nulle part, le recomptage est sans état, et une
 * recette attendue n'est jamais écrite. Leur preuve est dans les tests d'application.
 */
import type { GrandJournal, OperationJ } from '../journal.ts';
import { comptageDe, termesRecette } from './index.ts';

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

function violationsCotes(j: GrandJournal): Violation[] {
	const v: Violation[] = [];
	for (const op of j.operations) {
		const nom = `Opération ${op.id}`;
		for (const c of op.cotes) {
			if (c.sessionCaisseId === null || c.sessionCaisseId === undefined) {
				const couverte = j.sessions.some(
					(s) =>
						s.compteId === c.compteId &&
						op.origine === 'saisie' &&
						op.creeLe >= s.ouverteLe &&
						(s.clotureeLe === null || op.creeLe < s.clotureeLe)
				);
				if (couverte) v.push({ invariant: 'C12', message: `${nom} : hors de la Session ouverte.` });
				continue;
			}
			const session = j.sessions.find((s) => s.id === c.sessionCaisseId);
			if (session?.compteId !== c.compteId || !c.sessionPhase) {
				v.push({ invariant: 'C4', message: `${nom} : Côté mal rattaché à sa Session.` });
			}
			if (op.origine === 'recette_especes' || op.origine === 'ecart_caisse') {
				v.push({ invariant: 'C4', message: `${nom} : ne devrait porter aucune Session.` });
			}
		}
	}
	return v;
}

export function violationsCaisses(j: GrandJournal): Violation[] {
	return [
		...violationsSession(j),
		...violationsRecettes(j),
		...violationsEcarts(j),
		...violationsCotes(j)
	];
}
