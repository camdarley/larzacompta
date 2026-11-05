/** Bordereau de Remise (FR-22) : un modèle déjà calculé, le rendu n'additionne rien (AD-18). */
import { formaterDateLongue } from '../dates.ts';
import type { ModeleDocument, RangeeDocument } from '../etats/documents.ts';
import type { GrandJournal, OperationJ, RemiseJ } from '../journal.ts';
import type { Compte } from '../parametrage.ts';
import { accordCheques, chequesDeRemise, montantRecu } from './index.ts';

type Journal = Pick<
	GrandJournal,
	'operations' | 'operationsAnnulees' | 'pointages' | 'remises' | 'chequesRecus'
>;

export function modeleBordereau(
	j: Journal,
	r: RemiseJ,
	o: { association: string; exercice: string; comptes: readonly Compte[] }
): ModeleDocument {
	const op = [...j.operations, ...j.operationsAnnulees].find(
		(x) => x.id === r.operationId
	) as OperationJ;
	const compte = o.comptes.find((c) => c.id === op.cotes.find((x) => x.montant > 0)?.compteId);
	const { cheques, total } = chequesDeRemise(j, r.id);
	// Le n° est facultatif : une colonne vide n'apporterait rien au guichet.
	const avecNumero = cheques.some((c) => c.numero !== null);
	const rangees: RangeeDocument[] = cheques.map((c) => ({
		cellules: [
			c.emetteur,
			c.banque ?? '',
			...(avecNumero ? [c.numero ?? ''] : []),
			{ montant: montantRecu(j, c) }
		],
		niveau: 0
	}));
	return {
		titre: `Bordereau de Remise n° ${r.numero}`,
		association: o.association,
		exercice: o.exercice,
		provisoire: false,
		nomFichier: `bordereau-remise-${r.numero}`,
		sections: [
			{
				titre: `Remise du ${formaterDateLongue(op.date)}`,
				phrases: [
					`${accordCheques(cheques.length)} à déposer sur le Compte ${compte?.libelle ?? ''}.`
				],
				tableau: {
					legende: `Chèques de la Remise n° ${r.numero}`,
					colonnes: [
						{ libelle: 'Émetteur', montant: false },
						{ libelle: 'Banque', montant: false },
						...(avecNumero ? [{ libelle: 'N°', montant: false }] : []),
						{ libelle: 'Montant', montant: true }
					],
					rangees: [
						...rangees,
						{
							cellules: ['Total', null, ...(avecNumero ? [null] : []), { montant: total }],
							niveau: 0,
							fort: true,
							total: true
						}
					]
				}
			}
		]
	};
}
