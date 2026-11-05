/**
 * Clôture d'un Exercice (AD-5) : décision pure, paramétrage figé, sérialisation de l'empreinte.
 * Le SHA-256 se calcule hors du domaine : ici, seulement le texte à empreindre.
 */
import type { DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, OperationJ } from '../journal.ts';
import { echec, succes, type Resultat } from '../resultat.ts';
import {
	compteDeResultat,
	type CompteDeResultat,
	type NoeudGroupe,
	type ParametrageEtats,
	type Totaux
} from './resultat.ts';
import { etatTresorerie } from './tresorerie.ts';

/** Session de caisse vue par E4 : le jalon 2 remplit `GrandJournal.sessions`. */
export type SessionOuverte = { caisse: string; date: DateCivile };

/** E3 : le plus ancien ouvert d'abord. E4 : pas de Session ouverte datée dedans. Rien d'autre. */
export function deciderCloture(
	exercices: readonly Exercice[],
	exerciceId: number,
	sessionsOuvertes: readonly SessionOuverte[]
): Resultat<Exercice> {
	const e = exercices.find((x) => x.id === exerciceId);
	if (e === undefined) return echec('element_introuvable');
	if (e.statut === 'cloture') return echec('exercice_cloture', { exercice: e.libelle });
	if (e.statut !== 'ouvert') return echec('exercice_invalide');
	const plusAncien = exercices
		.filter((x) => x.statut === 'ouvert')
		.sort((a, b) => a.anneeDebut - b.anneeDebut)[0];
	if (plusAncien?.id !== e.id) return echec('cloture_ordre');
	const session = sessionsOuvertes.find(
		(s) => s.date >= (e.debut as DateCivile) && s.date <= (e.fin as DateCivile)
	);
	if (session) return echec('session_a_cloturer', { caisse: session.caisse });
	return succes(e);
}

/** Groupes, ordres, libellés, affectations, et les Comptes présentés à la clôture. */
export function figerParametrage(p: ParametrageEtats, comptesPresentes: readonly number[]) {
	const figes: ParametrageEtats = {
		groupes: p.groupes.map(({ id, libelle, ordre }) => ({ id, libelle, ordre })),
		natures: p.natures.map(({ id, libelle, groupeId, neutre }) => ({
			id,
			libelle,
			groupeId,
			neutre
		})),
		actions: p.actions.map(({ id, libelle, groupeId }) => ({ id, libelle, groupeId })),
		comptes: p.comptes
			.filter((c) => comptesPresentes.includes(c.id))
			.map(({ id, libelle, type, ordre }) => ({ id, libelle, type, ordre, actif: true }))
	};
	return figes;
}

const totaux = ({ recettes, depenses, resultat }: Totaux) => [recettes, depenses, resultat];

function serialiserGroupe(g: NoeudGroupe) {
	const natures = (liste: NoeudGroupe['sansAction']) =>
		liste.map((n) => [n.natureId, n.libelle, ...totaux(n)]);
	return {
		g: [g.groupeId, g.libelle, ...totaux(g)],
		a: g.actions.map((a) => [a.actionId, a.libelle, ...totaux(a), natures(a.natures)]),
		s: natures(g.sansAction)
	};
}

function serialiserResultat(cr: CompteDeResultat) {
	return {
		t: totaux(cr),
		g: cr.groupes.map(serialiserGroupe),
		anterieurs: { t: totaux(cr.anterieurs), g: cr.anterieurs.groupes.map(serialiserGroupe) },
		neutres: cr.neutres
	};
}

/** Sans `sans_piece`, `liaison_id`, `version`, Pièces ni Pointages : ils restent modifiables. */
function serialiserOperation(op: OperationJ) {
	return {
		id: op.id,
		genre: op.genre,
		origine: op.origine,
		date: op.date,
		libelle: op.libelle,
		reference: op.reference,
		mode: op.modePaiement,
		note: op.note,
		tiers: op.tiers,
		cotes: [...op.cotes]
			.sort((a, b) => a.id - b.id)
			.map((c) => [c.id, c.compteId, c.date, c.montant]),
		lignes: [...op.lignes]
			.sort((a, b) => a.id - b.id)
			.map((l) => [
				l.id,
				l.ordre,
				l.montant,
				l.estReduction,
				l.natureId,
				l.actionId,
				l.exerciceRattachementId,
				l.note
			])
	};
}

type JournalCloture = Pick<
	GrandJournal,
	'operations' | 'exercices' | 'ancres' | 'comptes' | 'creancesDettes'
>;

/**
 * Sérialisation canonique : ni horodatage, ni ordre de lecture. Les restes dus n'y figurent pas :
 * une Créance reste soldable et annulable après la clôture (F2).
 */
export function serialiserCloture(j: JournalCloture, e: Exercice, p: ParametrageEtats): string {
	const dans = (d: DateCivile) => d >= (e.debut as DateCivile) && d <= (e.fin as DateCivile);
	const operations = j.operations
		.filter((op) => dans(op.date) || op.cotes.some((c) => dans(c.date)))
		.sort((a, b) => a.id - b.id)
		.map(serialiserOperation);
	const tresorerie = etatTresorerie(j, e, p);
	return JSON.stringify({
		exercice: [e.id, e.libelle, e.debut, e.fin],
		operations,
		resultat: serialiserResultat(compteDeResultat(j, e, p)),
		tresorerie: {
			comptes: tresorerie.comptes.map((c) => [c.compteId, c.libelle, c.depart, c.fin]),
			totaux: [tresorerie.depart, tresorerie.fin, tresorerie.variation]
		}
	});
}
