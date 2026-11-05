/** Modèle du Budget, déjà calculé : le rendu PDF ou XLSX n'additionne rien (AD-18). */
import type { Cellule, ModeleDocument, RangeeDocument } from '../etats/documents.ts';
import type { Exercice } from '../exercices.ts';
import { formaterPourcentage, type EcartBudget, type VueBudget } from './index.ts';

const pourcent = (e: EcartBudget): Cellule =>
	e.pourcentage === null ? null : formaterPourcentage(e.pourcentage);

/** Sur une Nature : des montants de colonne. Sur un total de résultat : des montants signés. */
function cellules(libelle: string, e: EcartBudget, signe: boolean): Cellule[] {
	return [
		libelle,
		e.prevu === null ? null : { montant: e.prevu, signe },
		{ montant: e.realise, signe },
		{ montant: e.difference, signe: true },
		pourcent(e)
	];
}

const SENS = { recette: 'recette', depense: 'dépense' } as const;

export function modeleBudget(v: VueBudget, e: Exercice, association: string): ModeleDocument {
	const rangees: RangeeDocument[] = v.blocs.flatMap((b) => [
		{ cellules: cellules(b.libelle, b, true), niveau: 0, fort: true },
		...b.rangees.map((r) => ({
			cellules: cellules(`${r.libelle}, ${SENS[r.sens]}`, r, false),
			niveau: 1
		}))
	]);
	const { recettes, depenses, resultat } = v.totaux;
	return {
		titre: 'Budget',
		association,
		exercice: e.libelle,
		provisoire: e.statut !== 'cloture',
		nomFichier: `budget-${e.libelle}`,
		sections: [
			{
				titre: '',
				phrases: ['Le prévu et le réalisé de l’Exercice, Action par Action.'],
				tableau: {
					legende: 'Budget',
					colonnes: [
						{ libelle: 'Libellé', montant: false },
						{ libelle: 'Prévu', montant: true },
						{ libelle: 'Réalisé', montant: true },
						{ libelle: 'Différence', montant: true },
						{ libelle: '%', montant: true }
					],
					rangees: [
						...rangees,
						{ cellules: cellules('Recettes', recettes, false), niveau: 0, fort: true, total: true },
						{ cellules: cellules('Dépenses', depenses, false), niveau: 0, fort: true },
						{ cellules: cellules('Résultat', resultat, true), niveau: 0, fort: true }
					]
				}
			}
		]
	};
}
