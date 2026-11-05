/**
 * Q1 à Q6, rejoués par `ape verifier` sur la base telle qu'elle est.
 * Q3 se contrôle à chaque date où le Compte des chèques à remettre a bougé.
 */
import { soldeCompte } from '../etats/soldes.ts';
import type { GrandJournal } from '../journal.ts';
import { sommeCentimes } from '../montant.ts';
import {
	chequesDeRemise,
	compteCheques,
	compteDuCheque,
	etatRemise,
	montantRecu,
	totalEnAttente
} from './index.ts';

type Violation = { invariant: string; message: string };

function violationsRecus(j: GrandJournal): Violation[] {
	const compte = compteCheques(j);
	return j.chequesRecus.flatMap((c) => {
		const v: Violation[] = [];
		const nom = `Chèque reçu ${c.id}`;
		const op = j.operations.find((o) => o.id === c.operationId);
		const valide =
			op?.genre === 'standard' &&
			op.origine === 'cheque_recu' &&
			op.cotes[0]?.compteId === compte?.id;
		if (!valide) v.push({ invariant: 'Q1', message: `${nom} : Opération de forme invalide.` });
		if (c.remiseId !== null && !j.remises.some((r) => r.id === c.remiseId)) {
			v.push({ invariant: 'Q4', message: `${nom} : sa Remise n'existe pas.` });
		}
		if (c.remiseId !== null) {
			const remise = j.remises.find((r) => r.id === c.remiseId);
			if (remise && etatRemise(j, remise) === 'annulee') {
				v.push({ invariant: 'Q4', message: `${nom} : sa Remise est annulée.` });
			}
		}
		if (c.operationRejetId !== null) {
			const rejet = j.operations.find((o) => o.id === c.operationRejetId);
			const lignes = rejet?.lignes ?? [];
			const conforme =
				rejet?.origine === 'cheque_rejete' &&
				rejet.cotes[0]?.compteId === compteDuCheque(j, c) &&
				lignes.length > 0 &&
				lignes.every((l) => l.estReduction) &&
				sommeCentimes(lignes.map((l) => l.montant)) === -montantRecu(j, c);
			if (!conforme) v.push({ invariant: 'Q5', message: `${nom} : rejet invalide.` });
		}
		return v;
	});
}

function violationsRemises(j: GrandJournal): Violation[] {
	return j.remises.flatMap((r) => {
		if (etatRemise(j, r) === 'annulee') return [];
		const op = j.operations.find((o) => o.id === r.operationId);
		const entree = op?.cotes.find((c) => c.montant > 0);
		const conforme =
			op?.genre === 'interne' &&
			op.origine === 'remise' &&
			entree?.montant === chequesDeRemise(j, r.id).total;
		return conforme
			? []
			: [
					{
						invariant: 'Q2',
						message: `Remise n° ${r.numero} : son montant ne suit pas ses chèques.`
					}
				];
	});
}

function violationsSolde(j: GrandJournal): Violation[] {
	const compte = compteCheques(j);
	if (compte === undefined) return [];
	const dates = new Set(
		j.operations.flatMap((o) => o.cotes.filter((c) => c.compteId === compte.id).map((c) => c.date))
	);
	return [...dates].sort().flatMap((d) =>
		soldeCompte(j, compte.id, d) === totalEnAttente(j, d)
			? []
			: [
					{
						invariant: 'Q3',
						message: `Chèques à remettre : le solde du ${d} ne suit pas les chèques.`
					}
				]
	);
}

function violationsEmis(j: GrandJournal): Violation[] {
	return j.chequesEmis.flatMap((c) => {
		const annulee = j.operationsAnnulees.some((o) => o.id === c.operationId);
		const vivante = j.operations.some((o) => o.id === c.operationId);
		const coherent = c.annuleLe === null ? vivante : annulee || c.operationId === null;
		return coherent
			? []
			: [{ invariant: 'Q6', message: `Chèque émis ${c.numero} : il ne suit pas son Opération.` }];
	});
}

export function violationsCheques(j: GrandJournal): Violation[] {
	return [
		...violationsRecus(j),
		...violationsRemises(j),
		...violationsSolde(j),
		...violationsEmis(j)
	];
}
