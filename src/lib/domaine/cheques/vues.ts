/**
 * Ce que les écrans Chèques affichent, calculé d'un bloc depuis le journal (AD-4).
 * L'interface n'importe rien du serveur (AD-1) : ces formes vivent ici.
 */
import type { DateCivile } from '../dates.ts';
import type { ChequeRecuJ, GrandJournal, LigneJ, OperationJ, RemiseJ } from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import type { Action, Compte } from '../parametrage.ts';
import { chequesAbsents, type ChequeAbsent } from '../releve/cheques.ts';
import {
	chequesDeRemise,
	chequesEnAttente,
	etatChequeEmis,
	etatChequeRecu,
	etatRemise,
	montantRecu,
	remiseDe,
	type EtatChequeEmis,
	type EtatChequeRecu,
	type EtatRemise
} from './index.ts';

export type Noms = {
	actions: readonly Pick<Action, 'id' | 'libelle'>[];
	comptes: readonly (Pick<Compte, 'id' | 'libelle' | 'type'> & { actif?: boolean })[];
};

type JournalVue = GrandJournal;

const operationDe = (j: JournalVue, id: number | null): OperationJ | undefined =>
	j.operations.find((o) => o.id === id) ?? j.operationsAnnulees.find((o) => o.id === id);

const entree = (op: OperationJ | undefined) => op?.cotes.find((c) => c.montant > 0);

function nomsActions(lignes: readonly LigneJ[], noms: Noms): string[] {
	const ids = [...new Set(lignes.map((l) => l.actionId))];
	return ids.flatMap((id) => noms.actions.find((a) => a.id === id)?.libelle ?? []);
}

export type RangeeRecu = {
	id: number;
	operationId: number;
	date: DateCivile;
	emetteur: string;
	banque: string | null;
	numero: string | null;
	montant: Centimes;
	actions: string[];
	etat: EtatChequeRecu;
	remise: { id: number; numero: number } | null;
	rejet: { operationId: number; date: DateCivile } | null;
};

function rangeeRecu(j: JournalVue, c: ChequeRecuJ, noms: Noms): RangeeRecu {
	const op = operationDe(j, c.operationId) as OperationJ;
	const remise = remiseDe(j, c);
	const rejet = operationDe(j, c.operationRejetId);
	return {
		id: c.id,
		operationId: c.operationId,
		date: op.date,
		emetteur: c.emetteur,
		banque: c.banque,
		numero: c.numero,
		montant: montantRecu(j, c),
		actions: nomsActions(op.lignes, noms),
		etat: etatChequeRecu(j, c),
		remise: remise ? { id: remise.id, numero: remise.numero } : null,
		rejet: rejet ? { operationId: rejet.id, date: rejet.date } : null
	};
}

export type VueRecus = {
	rangees: RangeeRecu[];
	compteurs: Record<EtatChequeRecu, number>;
	totalAttente: Centimes;
	/** Nature déjà employée pour une Action : la rafale la reprend (Lignes de recette). */
	natureParAction: Record<number, number>;
	/** Banques déjà saisies, proposées à la frappe. */
	banques: string[];
};

function naturesParAction(j: JournalVue): Record<number, number> {
	const carte: Record<number, number> = {};
	for (const op of j.operations) {
		for (const l of op.lignes) {
			if (l.actionId !== null && l.montant > 0 && !l.estReduction) carte[l.actionId] = l.natureId;
		}
	}
	return carte;
}

export function vueRecus(j: JournalVue, noms: Noms): VueRecus {
	const rangees = j.chequesRecus
		.map((c) => rangeeRecu(j, c, noms))
		.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
	const compter = (e: EtatChequeRecu) => rangees.filter((r) => r.etat === e).length;
	return {
		rangees,
		compteurs: {
			en_attente: compter('en_attente'),
			remis: compter('remis'),
			pointe: compter('pointe'),
			rejete: compter('rejete')
		},
		totalAttente: sommeCentimes(
			rangees.filter((r) => r.etat === 'en_attente').map((r) => r.montant)
		),
		natureParAction: naturesParAction(j),
		banques: [
			...new Set(j.chequesRecus.flatMap((c) => (c.banque === null ? [] : [c.banque])))
		].sort((a, b) => a.localeCompare(b, 'fr'))
	};
}

/** Ce que le `panneau` du chèque reprend. */
export type FicheChequeRecu = {
	id: number;
	emetteur: string;
	banque: string | null;
	numero: string | null;
	etat: EtatChequeRecu;
	operation: OperationJ;
};

export function vueChequeRecu(j: JournalVue, c: ChequeRecuJ): FicheChequeRecu {
	return {
		id: c.id,
		emetteur: c.emetteur,
		banque: c.banque,
		numero: c.numero,
		etat: etatChequeRecu(j, c),
		operation: operationDe(j, c.operationId) as OperationJ
	};
}

export type RangeeRemise = {
	id: number;
	numero: number;
	date: DateCivile;
	compte: string;
	nombre: number;
	total: Centimes;
	etat: EtatRemise;
};

function rangeeRemise(j: JournalVue, r: RemiseJ, noms: Noms): RangeeRemise {
	const cote = entree(operationDe(j, r.operationId));
	const etat = etatRemise(j, r);
	return {
		id: r.id,
		numero: r.numero,
		date: operationDe(j, r.operationId)?.date ?? '',
		compte: noms.comptes.find((c) => c.id === cote?.compteId)?.libelle ?? '',
		nombre: chequesDeRemise(j, r.id).cheques.length,
		total: cote?.montant ?? centimes(0),
		etat
	};
}

export type VueRemises = {
	rangees: RangeeRemise[];
	compteurs: Record<EtatRemise, number>;
	/** Chèques en attente : le bouton Nouvelle Remise n'a de sens qu'avec eux. */
	enAttente: number;
};

export function vueRemises(j: JournalVue, noms: Noms): VueRemises {
	const rangees = j.remises.map((r) => rangeeRemise(j, r, noms)).reverse();
	const compter = (e: EtatRemise) => rangees.filter((r) => r.etat === e).length;
	return {
		rangees,
		compteurs: {
			remise: compter('remise'),
			pointee: compter('pointee'),
			annulee: compter('annulee')
		},
		enAttente: chequesEnAttente(j).length
	};
}

export type MouvementBanque = { id: number; date: DateCivile; libelle: string; montant: Centimes };

export type DetailRemise = RangeeRemise & {
	operationId: number;
	cheques: RangeeRecu[];
	/** Répartition de la banque : les Lignes de relevé du Pointage (FR-22). */
	mouvements: MouvementBanque[];
	/** Autres Remises reliées au même Pointage : la scission se lit depuis chacune. */
	avec: { id: number; numero: number }[];
	annulable: boolean;
};

export function vueRemise(j: JournalVue, r: RemiseJ, noms: Noms): DetailRemise {
	const rangee = rangeeRemise(j, r, noms);
	const cote = entree(operationDe(j, r.operationId));
	const pointage = j.pointages.find((p) => cote !== undefined && p.coteIds.includes(cote.id));
	const { cheques } = chequesDeRemise(j, r.id);
	const entrees = new Map(j.remises.map((x) => [entree(operationDe(j, x.operationId))?.id, x]));
	return {
		...rangee,
		operationId: r.operationId,
		cheques: cheques.map((c) => rangeeRecu(j, c, noms)),
		mouvements: j.lignesReleve
			.filter((l) => pointage?.ligneReleveIds.includes(l.id))
			.map(({ id, date, libelle, montant }) => ({ id, date, libelle, montant })),
		avec: (pointage?.coteIds ?? []).flatMap((id) => {
			const autre = entrees.get(id);
			return autre === undefined || autre.id === r.id
				? []
				: [{ id: autre.id, numero: autre.numero }];
		}),
		annulable: rangee.etat === 'remise' && cheques.every((c) => c.operationRejetId === null)
	};
}

export type VueNouvelleRemise = {
	cheques: RangeeRecu[];
	comptes: { id: number; libelle: string }[];
	/** La première banque : un dépôt sur le livret reste un choix. */
	compteId: number | null;
};

export function vueNouvelleRemise(j: JournalVue, noms: Noms): VueNouvelleRemise {
	const comptes = noms.comptes.filter(
		(c) => c.actif && (c.type === 'banque' || c.type === 'epargne')
	);
	const parDefaut = comptes.find((c) => c.type === 'banque') ?? comptes[0];
	return {
		cheques: chequesEnAttente(j)
			.map((c) => rangeeRecu(j, c, noms))
			.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
		comptes: comptes.map(({ id, libelle }) => ({ id, libelle })),
		compteId: parDefaut?.id ?? null
	};
}

export type RangeeEmis = {
	/** Nul pour un chèque du jalon 1, porté par son Opération. */
	id: number | null;
	numero: string;
	beneficiaire: string;
	/** Nul pour une formule annulée sans paiement. */
	montant: Centimes | null;
	actions: string[];
	operationId: number | null;
	date: DateCivile | null;
	etat: EtatChequeEmis;
};

export type VueEmis = {
	rangees: RangeeEmis[];
	compteurs: Record<EtatChequeEmis, number>;
	manquants: ChequeAbsent[];
};

/** Registre, plus les paiements du jalon 1 : leur n° en `reference` compte comme inscrit. */
export function vueEmis(j: JournalVue, noms: Noms): VueEmis {
	const inscrits = new Set(j.chequesEmis.map((c) => c.operationId));
	const duRegistre = j.chequesEmis.map((c): RangeeEmis => {
		const op = operationDe(j, c.operationId);
		return {
			id: c.id,
			numero: c.numero,
			beneficiaire: c.beneficiaire,
			montant: op ? centimes(Math.abs(op.cotes[0]?.montant ?? 0)) : null,
			actions: op ? nomsActions(op.lignes, noms) : [],
			operationId: c.operationId,
			date: op?.date ?? null,
			etat: etatChequeEmis(j, c)
		};
	});
	const anciens = j.operations
		.filter(
			(op) =>
				op.origine === 'saisie' &&
				op.modePaiement === 'cheque' &&
				op.reference !== null &&
				(op.cotes[0]?.montant ?? 0) < 0 &&
				!inscrits.has(op.id)
		)
		.map((op): RangeeEmis => ({
			id: null,
			numero: op.reference as string,
			beneficiaire: op.tiers ?? op.libelle,
			montant: centimes(Math.abs(op.cotes[0]?.montant ?? 0)),
			actions: nomsActions(op.lignes, noms),
			operationId: op.id,
			date: op.date,
			etat: etatChequeEmis(j, { operationId: op.id, annuleLe: null })
		}));
	const rangees = [...duRegistre, ...anciens].sort(
		(a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.id ?? 0) - (a.id ?? 0)
	);
	const compter = (e: EtatChequeEmis) => rangees.filter((r) => r.etat === e).length;
	return {
		rangees,
		compteurs: { emis: compter('emis'), pointe: compter('pointe'), annule: compter('annule') },
		manquants: chequesAbsents(j)
	};
}
