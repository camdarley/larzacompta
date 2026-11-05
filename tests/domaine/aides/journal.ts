import type { Exercice } from '#lib/domaine/exercices.ts';
import { journalVide, type GrandJournal, type OperationJ } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { Compte } from '#lib/domaine/parametrage.ts';
import type { Brouillon, ReferencesSaisie } from '#lib/domaine/operations/validation.ts';

export const E2025: Exercice = {
	id: 1,
	libelle: '2025-2026',
	anneeDebut: 2025,
	debut: '2025-09-01',
	fin: '2026-08-31',
	statut: 'cloture'
};
export const E2026: Exercice = {
	id: 2,
	libelle: '2026-2027',
	anneeDebut: 2026,
	debut: '2026-09-01',
	fin: '2027-08-31',
	statut: 'ouvert'
};
export const REPERE: Exercice = {
	id: 3,
	libelle: '2024-2025',
	anneeDebut: 2024,
	debut: null,
	fin: null,
	statut: 'repere'
};

export const CCP: Compte = {
	id: 1,
	libelle: 'CCP',
	type: 'banque',
	reserve: false,
	ordre: 1,
	actif: true
};
export const LIVRET: Compte = { ...CCP, id: 2, libelle: 'Livret', type: 'epargne', ordre: 2 };

export const REFERENCES: ReferencesSaisie = {
	exercices: [REPERE, E2025, E2026],
	ancres: [{ compteId: 1, exerciceId: 2, solde: centimes(100000) }],
	comptes: [CCP, LIVRET, { ...LIVRET, id: 3, actif: false }],
	natures: [
		{ id: 1, actif: true },
		{ id: 2, actif: false }
	],
	actions: [
		{ id: 1, actif: true },
		{ id: 2, actif: false }
	]
};

export function brouillonStandard(partiel: Partial<Brouillon> = {}): Brouillon {
	return {
		genre: 'standard',
		origine: 'saisie',
		date: '2026-10-05',
		libelle: 'Papeterie fictive',
		reference: null,
		modePaiement: 'virement',
		note: null,
		tiers: null,
		sansPiece: false,
		cotes: [{ compteId: 1, date: '2026-10-05', montant: centimes(-1000) }],
		lignes: [
			{
				montant: centimes(-1000),
				estReduction: false,
				natureId: 1,
				actionId: null,
				exerciceRattachementId: null,
				note: null
			}
		],
		...partiel
	};
}

let suivant = 1;

/** Opération de journal minimale : un Côté, une Ligne du même montant. */
export function operationJ(partiel: Partial<OperationJ> & { montant?: number } = {}): OperationJ {
	const { montant = -1000, ...reste } = partiel;
	const id = reste.id ?? suivant++;
	const date = reste.date ?? '2026-10-05';
	return {
		id,
		genre: 'standard',
		origine: 'saisie',
		date,
		libelle: 'Opération fictive',
		reference: null,
		modePaiement: null,
		note: null,
		tiers: null,
		liaisonId: null,
		sansPiece: false,
		version: 1,
		creeLe: `${date}T10:00:00.000Z`,
		annuleeLe: null,
		cotes: [{ id: id * 10, operationId: id, compteId: 1, date, montant: centimes(montant) }],
		lignes: [
			{
				id: id * 10,
				operationId: id,
				ordre: 1,
				montant: centimes(montant),
				estReduction: false,
				natureId: 1,
				actionId: null,
				exerciceRattachementId: 2,
				note: null
			}
		],
		pieces: [],
		...reste
	};
}

export function journal(partiel: Partial<GrandJournal> = {}): GrandJournal {
	return {
		...journalVide(),
		exercices: [REPERE, E2025, E2026],
		comptes: [CCP, LIVRET],
		ancres: [{ compteId: 1, exerciceId: 2, solde: centimes(100000) }],
		...partiel
	};
}
