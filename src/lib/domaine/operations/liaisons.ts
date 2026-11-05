/**
 * Paiements reliés (FR-10) et somme à rendre (FR-8).
 * Le total se calcule : relier, délier ou annuler ne change aucune Ligne.
 */
import { formaterMontant, formaterTerme, centimes, type Centimes } from '../montant.ts';
import { echec, succes, type Resultat } from '../resultat.ts';
import type { GrandJournal, LiaisonJ, OperationJ } from '../journal.ts';
import { montantOperation } from './lecture.ts';

export type ResumeLiaison = {
	liaison: LiaisonJ;
	/** Non annulées, dans l'ordre des dates. */
	operations: OperationJ[];
	total: Centimes;
	termes: string;
};

export function resumeLiaison(
	j: Pick<GrandJournal, 'operations' | 'liaisons'>,
	liaisonId: number
): ResumeLiaison | null {
	const liaison = j.liaisons.find((l) => l.id === liaisonId);
	if (liaison === undefined) return null;
	const operations = j.operations
		.filter((o) => o.liaisonId === liaisonId)
		.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
	const montants = operations.map(montantOperation);
	const total = montants.reduce<number>((n, m) => n + m, 0);
	// Le sens se lit par rapport au total : un remboursement vient en moins d'une dépense.
	const sens = Math.sign(total) || Math.sign(montants[0] ?? 0);
	const termes = montants.reduce((texte, m, i) => {
		const moins = Math.sign(m) === -sens;
		const terme = formaterTerme(centimes(Math.abs(m)));
		if (i === 0) return moins ? `− ${terme}` : terme;
		return `${texte} ${moins ? '−' : '+'} ${terme}`;
	}, '');
	return { liaison, operations, total: centimes(Math.abs(total)), termes };
}

/** « Fait partie de : Spectacle, 400,00 € au total, 220 + 180 » */
export function phraseLiaison(r: ResumeLiaison): string {
	return `Fait partie de : ${r.liaison.libelle}, ${formaterMontant(r.total)} au total, ${r.termes}`;
}

/** Relier deux Opérations : la liaison existante accueille l'autre, deux liaisons fusionnent. */
export type DecisionLiaison =
	| { type: 'nouvelle' }
	| { type: 'rejoindre'; liaisonId: number }
	| { type: 'fusionner'; garderId: number; retirerId: number };

export function deciderLiaison(
	a: OperationJ,
	b: OperationJ,
	liaisons: readonly LiaisonJ[]
): Resultat<DecisionLiaison> {
	if (a.id === b.id || a.annuleeLe !== null || b.annuleeLe !== null) {
		return echec('liaison_invalide');
	}
	const de = (o: OperationJ) => liaisons.find((l) => l.id === o.liaisonId);
	const [la, lb] = [de(a), de(b)];
	if (la?.type === 'somme_a_rendre' || lb?.type === 'somme_a_rendre') {
		return echec('liaison_invalide');
	}
	if (la && lb) {
		if (la.id === lb.id) return echec('liaison_invalide');
		return succes({ type: 'fusionner', garderId: la.id, retirerId: lb.id });
	}
	const existante = la ?? lb;
	return succes(existante ? { type: 'rejoindre', liaisonId: existante.id } : { type: 'nouvelle' });
}

/** Une Opération reçue sur la Nature neutre `somme_a_rendre`. */
export function estSommeARendre(
	op: Pick<OperationJ, 'genre' | 'cotes' | 'lignes'>,
	natureId: number
) {
	return (
		op.genre === 'standard' &&
		(op.cotes[0]?.montant ?? 0) > 0 &&
		op.lignes.length > 0 &&
		op.lignes.every((l) => l.natureId === natureId)
	);
}

/** Ce qu'il reste à rendre : ce qui a été reçu, moins ce qui est déjà reparti. */
export function resteARendre(
	j: Pick<GrandJournal, 'operations' | 'liaisons'>,
	op: OperationJ
): Centimes {
	if (op.liaisonId === null) return montantOperation(op);
	const liees = j.operations.filter((o) => o.liaisonId === op.liaisonId);
	let reste = 0;
	for (const o of liees) reste += montantOperation(o);
	return centimes(Math.max(0, reste));
}
