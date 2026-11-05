import type {
	ChequeEmisJ,
	ChequeRecuJ,
	CoteJ,
	CreanceDetteJ,
	Genre,
	GrandJournal,
	LiaisonJ,
	LigneJ,
	LigneReleveJ,
	ModePaiement,
	OperationJ,
	Origine,
	PhaseSession,
	PieceJ,
	PointageJ,
	RemiseJ,
	ComptageJ,
	Constat,
	SessionJ,
	TypeComptage,
	TypeLiaison
} from '#lib/domaine/journal.ts';
import { journalVide } from '#lib/domaine/journal.ts';
import { centimes } from '#lib/domaine/montant.ts';
import type { BrouillonValide } from '#lib/domaine/operations/validation.ts';
import type { DepotExercices, DepotOperations, DepotParametrage } from '../../application/ports.ts';
import type { Base } from './connexion.ts';

type OperationBrute = {
	id: number;
	genre: Genre;
	origine: Origine;
	date: string;
	libelle: string;
	reference: string | null;
	mode_paiement: ModePaiement | null;
	note: string | null;
	tiers: string | null;
	liaison_id: number | null;
	sans_piece: number;
	version: number;
	cree_le: string;
	annulee_le: string | null;
};
type CoteBrut = {
	id: number;
	operation_id: number;
	compte_id: number;
	date: string;
	montant_centimes: number;
	session_caisse_id: number | null;
	session_phase: PhaseSession | null;
};
type LigneBrute = {
	id: number;
	operation_id: number;
	ordre: number;
	montant_centimes: number;
	est_reduction: number;
	nature_id: number;
	action_id: number | null;
	exercice_rattachement_id: number;
	note: string | null;
};
type PieceBrute = {
	operation_id: number;
	id: number;
	sha256: string;
	nom_original: string;
	mime: string;
};
type ConstatBrut = {
	id: number;
	compte_id: number;
	date: string;
	solde_centimes: number;
	source: Constat['source'];
	cree_le: string;
};
type ComptageBrut = {
	id: number;
	compte_id: number;
	session_caisse_id: number | null;
	type: TypeComptage;
	date: string;
	compte_le: string;
	saisi_le: string;
	saisi_par: number;
	operation_ecart_id: number | null;
};
type CoupureBrute = { comptage_id: number; coupure_centimes: number; quantite: number };
type SessionBrute = {
	id: number;
	compte_id: number;
	action_id: number | null;
	ouverte_le: string;
	ouverte_par: number;
	cloturee_le: string | null;
	cloturee_par: number | null;
	operation_recette_id: number | null;
};
type LigneReleveBrute = {
	id: number;
	compte_id: number;
	date: string;
	montant_centimes: number;
	libelle: string;
	doublon: LigneReleveJ['doublon'];
	import_id: number | null;
	identifiant_source: string | null;
	empreinte: string;
};
type CreanceBrute = {
	id: number;
	sens: CreanceDetteJ['sens'];
	tiers: string;
	motif: string;
	montant_centimes: number;
	date: string;
	action_id: number | null;
	note: string | null;
	annulee_le: string | null;
};
type RemiseBrute = { id: number; numero: number; operation_id: number };
type ChequeRecuBrut = {
	id: number;
	operation_id: number;
	emetteur: string;
	banque: string | null;
	numero: string | null;
	date_cheque: string | null;
	remise_id: number | null;
	operation_rejet_id: number | null;
};
type ChequeEmisBrut = {
	id: number;
	numero: string;
	beneficiaire: string;
	operation_id: number | null;
	annule_le: string | null;
};
type ReglementBrut = {
	creance_dette_id: number;
	operation_id: number;
	montant_centimes: number;
};

const versCote = (c: CoteBrut): CoteJ => ({
	id: c.id,
	operationId: c.operation_id,
	compteId: c.compte_id,
	date: c.date,
	montant: centimes(c.montant_centimes),
	sessionCaisseId: c.session_caisse_id,
	sessionPhase: c.session_phase
});

const versLigne = (l: LigneBrute): LigneJ => ({
	id: l.id,
	operationId: l.operation_id,
	ordre: l.ordre,
	montant: centimes(l.montant_centimes),
	estReduction: l.est_reduction === 1,
	natureId: l.nature_id,
	actionId: l.action_id,
	exerciceRattachementId: l.exercice_rattachement_id,
	note: l.note
});

const versPiece = (p: PieceBrute): PieceJ => ({
	id: p.id,
	sha256: p.sha256,
	nomOriginal: p.nom_original,
	mime: p.mime
});

function versOperation(
	o: OperationBrute,
	cotes: CoteJ[],
	lignes: LigneJ[],
	pieces: PieceJ[]
): OperationJ {
	return {
		id: o.id,
		genre: o.genre,
		origine: o.origine,
		date: o.date,
		libelle: o.libelle,
		reference: o.reference,
		modePaiement: o.mode_paiement,
		note: o.note,
		tiers: o.tiers,
		liaisonId: o.liaison_id,
		sansPiece: o.sans_piece === 1,
		version: o.version,
		creeLe: o.cree_le,
		annuleeLe: o.annulee_le,
		cotes,
		lignes,
		pieces
	};
}

function grouper<T, K>(valeurs: readonly T[], cle: (v: T) => K): Map<K, T[]> {
	const carte = new Map<K, T[]>();
	for (const v of valeurs) {
		const liste = carte.get(cle(v));
		if (liste) liste.push(v);
		else carte.set(cle(v), [v]);
	}
	return carte;
}

export function creerDepotOperations(
	base: Base,
	parametrage: DepotParametrage,
	exercices: DepotExercices
): DepotOperations {
	const r = {
		operations: base.prepare('SELECT * FROM operation ORDER BY date, id'),
		operation: base.prepare('SELECT * FROM operation WHERE id = ?'),
		cotes: base.prepare('SELECT * FROM cote ORDER BY id'),
		cotesDe: base.prepare('SELECT * FROM cote WHERE operation_id = ? ORDER BY id'),
		lignes: base.prepare('SELECT * FROM ligne ORDER BY operation_id, ordre'),
		lignesDe: base.prepare('SELECT * FROM ligne WHERE operation_id = ? ORDER BY ordre'),
		pieces: base.prepare(`
			SELECT po.operation_id, p.id, p.sha256, p.nom_original, p.mime
			FROM piece_operation po JOIN piece p ON p.id = po.piece_id ORDER BY p.id
		`),
		piecesDe: base.prepare(`
			SELECT po.operation_id, p.id, p.sha256, p.nom_original, p.mime
			FROM piece_operation po JOIN piece p ON p.id = po.piece_id
			WHERE po.operation_id = ? ORDER BY p.id
		`),
		liaisons: base.prepare('SELECT id, type, libelle FROM liaison ORDER BY id'),
		constats: base.prepare('SELECT * FROM constat_solde ORDER BY date, id'),
		lignesReleve: base.prepare(
			`SELECT id, compte_id, date, montant_centimes, libelle, doublon, import_id, identifiant_source, empreinte
				 FROM ligne_releve ORDER BY date, id`
		),
		pointages: base.prepare('SELECT id, compte_id FROM pointage ORDER BY id'),
		pointageCotes: base.prepare('SELECT pointage_id, cote_id FROM pointage_cote'),
		pointageLignes: base.prepare('SELECT pointage_id, ligne_releve_id FROM pointage_ligne'),
		creances: base.prepare(`
			SELECT id, sens, tiers, motif, montant_centimes, date, action_id, note, annulee_le
			FROM creance_dette ORDER BY date, id
		`),
		reglements: base.prepare(
			'SELECT creance_dette_id, operation_id, montant_centimes FROM reglement ORDER BY id'
		),

		creerOperation: base.prepare(`
			INSERT INTO operation
				(genre, origine, date, libelle, reference, mode_paiement, note, tiers, sans_piece, cree_le, cree_par)
			VALUES
				(@genre, @origine, @date, @libelle, @reference, @modePaiement, @note, @tiers, @sansPiece, @creeLe, @creePar)
		`),
		modifierOperation: base.prepare(`
			UPDATE operation SET
				genre = @genre, origine = @origine, date = @date, libelle = @libelle,
				reference = @reference, mode_paiement = @modePaiement, note = @note, tiers = @tiers,
				version = version + 1
			WHERE id = @id AND version = @versionLue
		`),
		annuler: base.prepare('UPDATE operation SET annulee_le = ?, annulee_par = ? WHERE id = ?'),
		definirSansPiece: base.prepare('UPDATE operation SET sans_piece = ? WHERE id = ?'),
		comptages: base.prepare('SELECT * FROM comptage ORDER BY date, compte_le, id'),
		coupures: base.prepare(
			'SELECT * FROM comptage_coupure ORDER BY comptage_id, coupure_centimes DESC'
		),
		sessions: base.prepare('SELECT * FROM session_caisse ORDER BY id'),
		remises: base.prepare('SELECT id, numero, operation_id FROM remise ORDER BY numero'),
		chequesRecus: base.prepare(`
			SELECT id, operation_id, emetteur, banque, numero, date_cheque, remise_id, operation_rejet_id
			FROM cheque_recu ORDER BY id
		`),
		chequesEmis: base.prepare(
			'SELECT id, numero, beneficiaire, operation_id, annule_le FROM cheque_emis ORDER BY id'
		),

		creerCote: base.prepare(`
			INSERT INTO cote (operation_id, compte_id, date, montant_centimes, session_caisse_id, session_phase)
			VALUES (?, ?, ?, ?, ?, ?)
		`),
		modifierCote: base.prepare(
			'UPDATE cote SET compte_id = ?, date = ?, montant_centimes = ? WHERE id = ?'
		),
		// Le trigger de Côté pointé vise ces colonnes dès qu'elles sont citées, même inchangées.
		dateCote: base.prepare('UPDATE cote SET date = ? WHERE id = ?'),
		sessionCote: base.prepare(
			'UPDATE cote SET session_caisse_id = ?, session_phase = ? WHERE id = ?'
		),
		supprimerCote: base.prepare('DELETE FROM cote WHERE id = ?'),
		creerLigne: base.prepare(`
			INSERT INTO ligne
				(operation_id, ordre, montant_centimes, est_reduction, nature_id, action_id, exercice_rattachement_id, note)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`),
		supprimerLignes: base.prepare('DELETE FROM ligne WHERE operation_id = ?'),

		creerLiaison: base.prepare('INSERT INTO liaison (type, libelle) VALUES (?, ?)'),
		definirLiaison: base.prepare('UPDATE operation SET liaison_id = ? WHERE id = ?'),
		deplacerLiaison: base.prepare('UPDATE operation SET liaison_id = ? WHERE liaison_id = ?'),
		detacherLiaison: base.prepare('UPDATE operation SET liaison_id = NULL WHERE liaison_id = ?'),
		supprimerLiaison: base.prepare('DELETE FROM liaison WHERE id = ?'),
		operationsDeLiaison: base
			.prepare('SELECT id FROM operation WHERE liaison_id = ? ORDER BY id')
			.pluck()
	};

	function creerCote(operationId: number, c: BrouillonValide['cotes'][number]) {
		r.creerCote.run(
			operationId,
			c.compteId,
			c.date,
			c.montant,
			c.sessionCaisseId ?? null,
			c.sessionPhase ?? null
		);
	}

	function ecrireLignes(operationId: number, o: BrouillonValide) {
		o.lignes.forEach((l, i) => {
			r.creerLigne.run(
				operationId,
				i + 1,
				l.montant,
				l.estReduction ? 1 : 0,
				l.natureId,
				l.actionId,
				l.exerciceRattachementId,
				l.note
			);
		});
	}

	function chargerPointages(): PointageJ[] {
		const cotes = grouper(
			r.pointageCotes.all() as { pointage_id: number; cote_id: number }[],
			(c) => c.pointage_id
		);
		const lignes = grouper(
			r.pointageLignes.all() as { pointage_id: number; ligne_releve_id: number }[],
			(l) => l.pointage_id
		);
		return (r.pointages.all() as { id: number; compte_id: number }[]).map((p) => ({
			id: p.id,
			compteId: p.compte_id,
			coteIds: (cotes.get(p.id) ?? []).map((c) => c.cote_id),
			ligneReleveIds: (lignes.get(p.id) ?? []).map((l) => l.ligne_releve_id)
		}));
	}

	function chargerComptages(): ComptageJ[] {
		const coupures = grouper(r.coupures.all() as CoupureBrute[], (c) => c.comptage_id);
		return (r.comptages.all() as ComptageBrut[]).map((c) => ({
			id: c.id,
			compteId: c.compte_id,
			sessionCaisseId: c.session_caisse_id,
			type: c.type,
			date: c.date,
			compteLe: c.compte_le,
			saisiLe: c.saisi_le,
			saisiPar: c.saisi_par,
			operationEcartId: c.operation_ecart_id,
			coupures: (coupures.get(c.id) ?? []).map((x) => ({
				coupure: centimes(x.coupure_centimes),
				quantite: x.quantite
			}))
		}));
	}

	const versSession = (s: SessionBrute): SessionJ => ({
		id: s.id,
		compteId: s.compte_id,
		actionId: s.action_id,
		ouverteLe: s.ouverte_le,
		ouvertePar: s.ouverte_par,
		clotureeLe: s.cloturee_le,
		clotureePar: s.cloturee_par,
		operationRecetteId: s.operation_recette_id
	});

	const versRemise = (x: RemiseBrute): RemiseJ => ({
		id: x.id,
		numero: x.numero,
		operationId: x.operation_id
	});

	const versChequeRecu = (c: ChequeRecuBrut): ChequeRecuJ => ({
		id: c.id,
		operationId: c.operation_id,
		emetteur: c.emetteur,
		banque: c.banque,
		numero: c.numero,
		dateCheque: c.date_cheque,
		remiseId: c.remise_id,
		operationRejetId: c.operation_rejet_id
	});

	const versChequeEmis = (c: ChequeEmisBrut): ChequeEmisJ => ({
		id: c.id,
		numero: c.numero,
		beneficiaire: c.beneficiaire,
		operationId: c.operation_id,
		annuleLe: c.annule_le
	});

	function chargerCreances(): CreanceDetteJ[] {
		const reglements = grouper(r.reglements.all() as ReglementBrut[], (x) => x.creance_dette_id);
		return (r.creances.all() as CreanceBrute[]).map((c) => ({
			id: c.id,
			sens: c.sens,
			tiers: c.tiers,
			motif: c.motif,
			montant: centimes(c.montant_centimes),
			date: c.date,
			actionId: c.action_id,
			note: c.note,
			annuleeLe: c.annulee_le,
			reglements: (reglements.get(c.id) ?? []).map((x) => ({
				operationId: x.operation_id,
				montant: centimes(x.montant_centimes)
			}))
		}));
	}

	return {
		/** Des lignes, sans agrégat : aucun montant ne se calcule en SQL (AD-4). */
		journal(): GrandJournal {
			const cotes = grouper((r.cotes.all() as CoteBrut[]).map(versCote), (c) => c.operationId);
			const lignes = grouper((r.lignes.all() as LigneBrute[]).map(versLigne), (l) => l.operationId);
			const pieces = grouper(r.pieces.all() as PieceBrute[], (p) => p.operation_id);
			const operations = (r.operations.all() as OperationBrute[]).map((o) =>
				versOperation(
					o,
					cotes.get(o.id) ?? [],
					lignes.get(o.id) ?? [],
					(pieces.get(o.id) ?? []).map(versPiece)
				)
			);
			const actives = operations.filter((o) => o.annuleeLe === null);
			const annulees = operations.filter((o) => o.annuleeLe !== null);
			const sorties = new Set(annulees.map((o) => o.id));
			return {
				...journalVide(),
				exercices: exercices.lister(),
				comptes: parametrage.comptes(),
				ancres: parametrage.ancres(),
				operations: actives,
				operationsAnnulees: annulees,
				liaisons: r.liaisons.all() as LiaisonJ[],
				constats: (r.constats.all() as ConstatBrut[]).map((c) => ({
					id: c.id,
					compteId: c.compte_id,
					date: c.date,
					solde: centimes(c.solde_centimes),
					source: c.source,
					creeLe: c.cree_le
				})),
				comptages: chargerComptages(),
				sessions: (r.sessions.all() as SessionBrute[]).map(versSession),
				pointages: chargerPointages(),
				lignesReleve: (r.lignesReleve.all() as LigneReleveBrute[]).map((l) => ({
					id: l.id,
					compteId: l.compte_id,
					date: l.date,
					montant: centimes(l.montant_centimes),
					libelle: l.libelle,
					doublon: l.doublon,
					importId: l.import_id,
					identifiantSource: l.identifiant_source,
					empreinte: l.empreinte
				})),
				remises: (r.remises.all() as RemiseBrute[]).map(versRemise),
				chequesRecus: (r.chequesRecus.all() as ChequeRecuBrut[])
					.map(versChequeRecu)
					.filter((c) => !sorties.has(c.operationId)),
				chequesEmis: (r.chequesEmis.all() as ChequeEmisBrut[]).map(versChequeEmis),
				creancesDettes: chargerCreances()
			};
		},

		parId(id) {
			const o = r.operation.get(id) as OperationBrute | undefined;
			if (o === undefined) return null;
			return versOperation(
				o,
				(r.cotesDe.all(id) as CoteBrut[]).map(versCote),
				(r.lignesDe.all(id) as LigneBrute[]).map(versLigne),
				(r.piecesDe.all(id) as PieceBrute[]).map(versPiece)
			);
		},

		liaisons: () => r.liaisons.all() as LiaisonJ[],

		creer(o) {
			const id = Number(
				r.creerOperation.run({
					genre: o.genre,
					origine: o.origine,
					date: o.date,
					libelle: o.libelle,
					reference: o.reference,
					modePaiement: o.modePaiement,
					note: o.note,
					tiers: o.tiers,
					sansPiece: o.sansPiece ? 1 : 0,
					creeLe: o.creeLe,
					creePar: o.creePar
				}).lastInsertRowid
			);
			for (const c of o.cotes) creerCote(id, c);
			ecrireLignes(id, o);
			return id;
		},

		modifier(id, versionLue, o) {
			const fait = r.modifierOperation.run({
				id,
				versionLue,
				genre: o.genre,
				origine: o.origine,
				date: o.date,
				libelle: o.libelle,
				reference: o.reference,
				modePaiement: o.modePaiement,
				note: o.note,
				tiers: o.tiers
			});
			if (fait.changes === 0) return false;

			// Un Côté garde son identifiant : le Pointage le référence.
			const existants = r.cotesDe.all(id) as CoteBrut[];
			o.cotes.forEach((c, i) => {
				const existant = existants[i];
				if (existant === undefined) {
					creerCote(id, c);
					return;
				}
				r.sessionCote.run(c.sessionCaisseId ?? null, c.sessionPhase ?? null, existant.id);
				if (existant.compte_id === c.compteId && existant.montant_centimes === c.montant) {
					r.dateCote.run(c.date, existant.id);
				} else {
					r.modifierCote.run(c.compteId, c.date, c.montant, existant.id);
				}
			});
			for (const c of existants.slice(o.cotes.length)) r.supprimerCote.run(c.id);

			r.supprimerLignes.run(id);
			ecrireLignes(id, o);
			return true;
		},

		annuler: (id, le, par) => void r.annuler.run(le, par, id),
		definirSansPiece: (id, sansPiece) => void r.definirSansPiece.run(sansPiece ? 1 : 0, id),

		creerLiaison: (l: { type: TypeLiaison; libelle: string }) =>
			Number(r.creerLiaison.run(l.type, l.libelle).lastInsertRowid),
		definirLiaison: (operationId, liaisonId) => void r.definirLiaison.run(liaisonId, operationId),
		deplacerLiaison: (depuis, vers) => void r.deplacerLiaison.run(vers, depuis),
		retirerLiaison(id) {
			r.detacherLiaison.run(id);
			r.supprimerLiaison.run(id);
		},
		operationsDeLiaison: (id) => r.operationsDeLiaison.all(id) as number[]
	};
}
