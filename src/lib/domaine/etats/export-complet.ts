/**
 * Export complet (FR-35) : des rangées de texte, lisibles sans l'outil.
 * Une Ligne dit à quel résultat elle compte : la somme d'une colonne se refait dans un tableur.
 */
import { totalComptage } from '../caisse/index.ts';
import { LIBELLES_COMPTAGE } from '../caisse/vues.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, OperationJ } from '../journal.ts';
import { LIBELLES_MODE_PAIEMENT } from '../journal.ts';
import { formaterCsv, sommeCentimes } from '../montant.ts';
import { colonneDe, exerciceDuMouvement, groupeDe } from './soldes.ts';
import type { ParametrageEtats } from './resultat.ts';

export type TableCsv = { entetes: string[]; lignes: string[][] };

export type PieceExportee = { id: number; sha256: string; nomOriginal: string };

/** Chemin dans l'archive, sans dossier ni caractère gênant : deux Pièces ne se recouvrent pas. */
export function cheminPiece(p: Pick<PieceExportee, 'id' | 'nomOriginal'>): string {
	const nom = p.nomOriginal
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^\w.-]+/g, '-')
		.replace(/^[-.]+/, '');
	return `pieces/${String(p.id).padStart(4, '0')}-${nom || 'piece'}`;
}

const nomDe = (liste: readonly { id: number; libelle: string }[], id: number | null) =>
	liste.find((x) => x.id === id)?.libelle ?? '';

function typeOperation(op: OperationJ): string {
	if (op.genre === 'interne') return 'Mouvement interne';
	if (op.genre === 'compensee') return 'Opération compensée';
	const total = sommeCentimes(op.lignes.map((l) => l.montant));
	return total < 0 ? 'Dépense' : 'Recette';
}

export function csvOperations(
	j: Pick<GrandJournal, 'operations' | 'operationsAnnulees'>,
	p: ParametrageEtats
): TableCsv {
	const montant = (op: OperationJ) =>
		op.genre === 'interne'
			? sommeCentimes(op.cotes.filter((c) => c.montant > 0).map((c) => c.montant))
			: sommeCentimes(op.lignes.map((l) => l.montant));
	const rangee = (op: OperationJ) => [
		String(op.id),
		op.date,
		typeOperation(op),
		op.libelle,
		formaterCsv(montant(op)),
		op.cotes.map((c) => nomDe(p.comptes, c.compteId)).join(' | '),
		op.modePaiement ? LIBELLES_MODE_PAIEMENT[op.modePaiement] : '',
		op.reference ?? '',
		op.tiers ?? '',
		op.note ?? '',
		op.annuleeLe ? 'Annulée' : '',
		op.pieces.map(cheminPiece).join(' | ')
	];
	return {
		entetes: [
			'N° d’Opération',
			'Date',
			'Type',
			'Libellé',
			'Montant',
			'Comptes',
			'Mode de paiement',
			'Référence',
			'Tiers',
			'Note',
			'État',
			'Fichiers des Pièces'
		],
		lignes: [...j.operations, ...j.operationsAnnulees]
			.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
			.map(rangee)
	};
}

/** Une Opération annulée sort des calculs : ses Lignes restent seulement dans `operations.csv`. */
export function csvLignes(
	j: Pick<GrandJournal, 'operations' | 'exercices'>,
	courant: ParametrageEtats,
	parExercice: (e: Exercice) => ParametrageEtats = () => courant
): TableCsv {
	const lignes = j.operations.flatMap((op) => {
		const exercice = exerciceDuMouvement(j, op);
		const p = exercice ? parExercice(exercice) : courant;
		const neutres = new Set(p.natures.filter((n) => n.neutre).map((n) => n.id));
		return op.lignes.map((l) => {
			const courante = exercice?.id === l.exerciceRattachementId && !neutres.has(l.natureId);
			return [
				String(op.id),
				op.date,
				op.libelle,
				formaterCsv(l.montant),
				colonneDe(l) === 'recette' ? 'Recette' : 'Dépense',
				nomDe(p.natures, l.natureId),
				nomDe(p.actions, l.actionId),
				nomDe(p.groupes, groupeDe(l, p) ?? null),
				exercice?.libelle ?? '',
				nomDe(j.exercices, l.exerciceRattachementId),
				courante ? (exercice?.libelle ?? '') : ''
			];
		});
	});
	return {
		entetes: [
			'N° d’Opération',
			'Date',
			'Libellé',
			'Montant de la Ligne',
			'Colonne',
			'Nature',
			'Action',
			'Groupe',
			'Exercice du mouvement',
			'Exercice de rattachement',
			'Compte dans le résultat de'
		],
		lignes
	};
}

export function csvPointages(
	j: Pick<GrandJournal, 'operations' | 'pointages' | 'lignesReleve'>,
	p: Pick<ParametrageEtats, 'comptes'>
): TableCsv {
	const lignes = j.pointages.flatMap((pointage) => {
		const compte = nomDe(p.comptes, pointage.compteId);
		const cotes = j.operations.flatMap((op) =>
			op.cotes
				.filter((c) => pointage.coteIds.includes(c.id))
				.map((c) => [
					String(pointage.id),
					compte,
					'Opération',
					c.date,
					op.libelle,
					formaterCsv(c.montant),
					String(op.id)
				])
		);
		const releve = j.lignesReleve
			.filter((l) => pointage.ligneReleveIds.includes(l.id))
			.map((l) => [
				String(pointage.id),
				compte,
				'Ligne de relevé',
				l.date,
				l.libelle,
				formaterCsv(l.montant),
				''
			]);
		return [...cotes, ...releve];
	});
	return {
		entetes: [
			'N° de Pointage',
			'Compte',
			'Élément',
			'Date',
			'Libellé',
			'Montant',
			'N° d’Opération'
		],
		lignes
	};
}

export function csvComptages(
	j: Pick<GrandJournal, 'comptages'>,
	p: Pick<ParametrageEtats, 'comptes'>
): TableCsv {
	return {
		entetes: ['Date', 'Caisse', 'Comptage', 'Total', 'Coupures', 'N° de Session'],
		lignes: j.comptages.map((c) => [
			c.date,
			nomDe(p.comptes, c.compteId),
			LIBELLES_COMPTAGE[c.type],
			formaterCsv(totalComptage(c.coupures)),
			c.coupures.map((x) => `${x.quantite} × ${formaterCsv(x.coupure)}`).join(' ; '),
			c.sessionCaisseId === null ? '' : String(c.sessionCaisseId)
		])
	};
}

/** Texte de `LISEZMOI.txt`, sans vocabulaire de logiciel comptable. */
export function lisezMoi(
	association: string,
	date: string,
	exercices: readonly Exercice[]
): string {
	const tenus = exercices.filter((e) => e.statut !== 'repere').map((e) => e.libelle);
	return [
		`Export complet de ${association}, du ${date}.`,
		`Exercices tenus : ${tenus.join(', ') || 'aucun'}.`,
		'',
		'Tout se lit sans l’outil : ces fichiers s’ouvrent dans un tableur français.',
		'Les CSV sont en UTF-8 avec BOM, le séparateur est le point-virgule, les montants s’écrivent 1234,56.',
		'',
		'operations.csv : une rangée par Opération, annulées comprises.',
		'  La colonne « Fichiers des Pièces » donne le chemin de chaque Pièce dans ce dossier.',
		'lignes.csv : la répartition de chaque Opération non annulée, une rangée par Ligne.',
		'  Filtrez « Compte dans le résultat de » sur un Exercice : la somme des montants égale son résultat.',
		'pointages.csv : les Opérations et les Lignes de relevé reliées, une rangée par élément.',
		'comptages.csv : chaque Comptage de caisse, avec son total et ses coupures.',
		'pieces/ : les Pièces, telles qu’elles ont été déposées.',
		''
	].join('\r\n');
}
