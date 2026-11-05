/**
 * Propositions de Pointage (AD-8) : la fonction lit, explique et n'écrit jamais.
 * Une proposition présélectionnée reste une proposition : seule une action explicite pointe.
 */
import { joursEntre, type DateCivile } from '../dates.ts';
import { accordCheques, chequesDeRemise, montantRecu } from '../cheques/index.ts';
import type { CoteJ, GrandJournal, LigneReleveJ, OperationJ } from '../journal.ts';
import type { Centimes } from '../montant.ts';
import { normaliserLibelle } from './empreinte.ts';
import { motsParlants, referenceLue, referencesDuLibelle } from './references.ts';

export const MAX_PROPOSITIONS = 3;
const JOURS_PROCHES = 3;

export type Proposition = {
	coteId: number;
	operationId: number;
	libelle: string;
	date: DateCivile;
	montant: Centimes;
	raison: string;
	/** Fondée sur une référence ou un montant unique : sélectionnée d'avance, jamais pointée. */
	preselection: boolean;
	/** Une Remise se présente avec ses chèques et son bordereau (FR-22). */
	remise: RemiseProposee | null;
};

export type RemiseProposee = {
	id: number;
	numero: number;
	cheques: { id: number; emetteur: string; montant: Centimes }[];
};

type JournalProposition = Pick<
	GrandJournal,
	'operations' | 'operationsAnnulees' | 'pointages' | 'comptes' | 'remises' | 'chequesRecus'
>;

/** Côté de Mouvement interne : proposé comme une Opération, chaque côté se pointe seul (FR-7). */
export function libelleDuCote(
	j: Pick<GrandJournal, 'comptes'>,
	op: OperationJ,
	cote: CoteJ
): string {
	if (op.genre !== 'interne' || op.origine === 'remise') return op.libelle;
	const autre = op.cotes.find((c) => c.id !== cote.id);
	const nom = j.comptes.find((c) => c.id === autre?.compteId)?.libelle ?? '';
	return cote.montant < 0 ? `Virement vers ${nom}` : `Virement depuis ${nom}`;
}

export function cotesOuverts(
	j: Pick<GrandJournal, 'operations' | 'pointages'>,
	compteId: number
): { cote: CoteJ; operation: OperationJ }[] {
	const pointes = new Set(j.pointages.flatMap((p) => p.coteIds));
	return j.operations.flatMap((operation) =>
		operation.cotes
			.filter((c) => c.compteId === compteId && !pointes.has(c.id))
			.map((cote) => ({ cote, operation }))
	);
}

type Indices = {
	memeMontant: boolean;
	unique: boolean;
	reference: boolean;
	libelle: boolean;
	/** La ligne parle de Remise ou de chèques, et l'Opération en est une. */
	remise: boolean;
};

const MOTS_REMISE = /\b(?:REMISE|CHEQUES?)\b/;

function indicesDe(ligne: LigneReleveJ, cote: CoteJ, op: OperationJ, unique: boolean): Indices {
	const references = [
		...(op.reference === null ? [] : [op.reference]),
		...referencesDuLibelle(op.libelle)
	];
	const motsLigne = new Set(motsParlants(ligne.libelle));
	return {
		memeMontant: cote.montant === ligne.montant,
		unique,
		reference: references.some((r) => referenceLue(ligne.libelle, r)),
		libelle: motsParlants(`${op.libelle} ${op.tiers ?? ''}`).some((m) => motsLigne.has(m)),
		remise: op.origine === 'remise' && MOTS_REMISE.test(normaliserLibelle(ligne.libelle))
	};
}

function scoreDe(i: Indices, jours: number): number {
	return (
		(i.memeMontant ? 50 : 0) +
		(i.reference ? 40 : 0) +
		(i.libelle ? 15 : 0) +
		(i.remise ? 20 : 0) +
		(i.memeMontant && i.unique ? 10 : 0) -
		Math.min(jours, 30)
	);
}

function remiseProposee(j: JournalProposition, op: OperationJ): RemiseProposee | null {
	const remise = j.remises.find((r) => r.operationId === op.id);
	if (remise === undefined) return null;
	return {
		id: remise.id,
		numero: remise.numero,
		cheques: chequesDeRemise(j, remise.id).cheques.map((c) => ({
			id: c.id,
			emetteur: c.emetteur,
			montant: montantRecu(j, c)
		}))
	};
}

function raisonDe(i: Indices, op: OperationJ, jours: number, remise: RemiseProposee | null) {
	if (remise) {
		const nom = `Remise de ${accordCheques(remise.cheques.length)}`;
		return i.memeMontant
			? `Même montant, ${nom}`
			: `${nom}, montant différent : la banque l’a peut-être scindée`;
	}
	const numero = op.modePaiement === 'cheque' ? 'n° de chèque' : 'n° de facture';
	if (i.reference) {
		return i.memeMontant
			? `Même montant, ${numero} lu dans le libellé`
			: `${numero === 'n° de chèque' ? 'N° de chèque' : 'N° de facture'} lu dans le libellé, montant différent`;
	}
	if (!i.memeMontant) return 'Libellé proche, montant différent';
	if (i.libelle) return 'Même montant, libellé proche';
	if (i.unique) return 'Même montant, seule Opération à ce montant';
	return jours <= JOURS_PROCHES ? 'Même montant, date proche' : 'Même montant';
}

export function proposer(j: JournalProposition, ligne: LigneReleveJ): Proposition[] {
	const ouverts = cotesOuverts(j, ligne.compteId);
	const auMontant = ouverts.filter((o) => o.cote.montant === ligne.montant).length;

	return ouverts
		.flatMap(({ cote, operation }) => {
			if (Math.sign(cote.montant) !== Math.sign(ligne.montant)) return [];
			const i = indicesDe(ligne, cote, operation, auMontant === 1);
			if (!i.memeMontant && !i.reference && !i.libelle && !i.remise) return [];
			const jours = Math.abs(joursEntre(cote.date, ligne.date));
			return [{ cote, operation, i, jours, score: scoreDe(i, jours) }];
		})
		.sort((a, b) => b.score - a.score || a.jours - b.jours || a.cote.id - b.cote.id)
		.slice(0, MAX_PROPOSITIONS)
		.map(({ cote, operation, i, jours }) => {
			const remise = remiseProposee(j, operation);
			return {
				coteId: cote.id,
				operationId: operation.id,
				libelle: libelleDuCote(j, operation, cote),
				date: cote.date,
				montant: cote.montant,
				raison: raisonDe(i, operation, jours, remise),
				preselection: i.reference || (i.memeMontant && i.unique),
				remise
			};
		});
}
