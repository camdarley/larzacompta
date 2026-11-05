/**
 * Contrôles rejoués par `ape verifier` : invariants du §6 livrés et équation de contrôle.
 * Ils lisent la base telle qu'elle est : rien ne suppose que le chemin d'écriture a été respecté.
 */
import { violationsCaisses } from '../caisse/verification.ts';
import { violationsCheques } from '../cheques/verification.ts';
import { ajouterJours, type DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal, OperationJ } from '../journal.ts';
import { MONTANT_MAX, sommeCentimes, type Centimes } from '../montant.ts';
import { anomaliesEquation, equationDeControle, type ParametrageEtats } from './resultat.ts';
import { messageAnomalie } from './anomalies.ts';
import { exerciceDeDate } from './soldes.ts';

export type Violation = { invariant: string; message: string; exercice?: string };

const somme = (l: readonly { montant: Centimes }[]) => sommeCentimes(l.map((x) => x.montant));

function formeOperation(op: OperationJ): string | null {
	const nom = `Opération ${op.id}`;
	if (op.genre === 'standard') {
		if (op.cotes.length !== 1 || op.lignes.length === 0) return `O2 ${nom} : forme invalide.`;
		return op.cotes[0]?.date === op.date ? null : `O2 ${nom} : date du Côté différente.`;
	}
	if (op.genre === 'interne') {
		const [a, b] = op.cotes;
		const valide =
			a !== undefined &&
			b !== undefined &&
			op.cotes.length === 2 &&
			a.compteId !== b.compteId &&
			a.montant + b.montant === 0 &&
			op.lignes.length === 0;
		if (!valide) return `O3 ${nom} : Mouvement interne invalide.`;
		return op.cotes.find((c) => c.montant < 0)?.date === op.date
			? null
			: `O3 ${nom} : date différente du Côté sortant.`;
	}
	const sens = (positif: boolean) => op.lignes.some((l) => l.montant > 0 === positif);
	return op.cotes.length <= 1 && sens(true) && sens(false)
		? null
		: `O4 ${nom} : Opération compensée invalide.`;
}

function violationsOperation(j: GrandJournal, op: OperationJ): Violation[] {
	const v: Violation[] = [];
	const ajouter = (invariant: string, message: string, exercice?: string) =>
		v.push({ invariant, message, ...(exercice ? { exercice } : {}) });
	const exercice = exerciceDeDate(j.exercices, op.date);
	const nom = `Opération ${op.id}`;

	if (op.genre !== 'interne' && somme(op.cotes) !== somme(op.lignes)) {
		ajouter('O1', `${nom} : Côtés et Lignes ne s'équilibrent pas.`, exercice?.libelle);
	}
	const forme = formeOperation(op);
	if (forme) ajouter(forme.slice(0, 2), forme.slice(3), exercice?.libelle);

	const dates = [op.date, ...op.cotes.map((c) => c.date)];
	if (dates.some((d) => exerciceDeDate(j.exercices, d) === undefined)) {
		ajouter('O5', `${nom} : une date ne tombe dans aucun Exercice.`);
	}
	for (const c of op.cotes) {
		const ancre = j.ancres.find((a) => a.compteId === c.compteId);
		const debut = j.exercices.find((e) => e.id === ancre?.exerciceId)?.debut;
		if (debut && c.date < debut) ajouter('O5', `${nom} : Côté antérieur à l'ancre du Compte.`);
	}
	for (const l of op.lignes) {
		const cible = j.exercices.find((e) => e.id === l.exerciceRattachementId);
		if (exercice && (cible === undefined || cible.anneeDebut > exercice.anneeDebut)) {
			ajouter('O6', `${nom} : rattachement invalide.`, exercice.libelle);
		}
	}
	return v;
}

function violationsPointage(j: GrandJournal): Violation[] {
	const cotes = new Map(j.operations.flatMap((o) => o.cotes.map((c) => [c.id, c])));
	const annules = new Set(j.operationsAnnulees.flatMap((o) => o.cotes.map((c) => c.id)));
	const lignes = new Map(j.lignesReleve.map((l) => [l.id, l]));
	return j.pointages.flatMap((p) => {
		const v: Violation[] = [];
		const nom = `Pointage ${p.id}`;
		const lesCotes = p.coteIds.flatMap((id) => cotes.get(id) ?? []);
		const lesLignes = p.ligneReleveIds.flatMap((id) => lignes.get(id) ?? []);
		const compte = j.comptes.find((c) => c.id === p.compteId);
		if (
			[...lesCotes, ...lesLignes].some((x) => x.compteId !== p.compteId) ||
			lesCotes.length !== p.coteIds.filter((id) => !annules.has(id)).length
		) {
			v.push({ invariant: 'P1', message: `${nom} : un élément porte sur un autre Compte.` });
		}
		if (somme(lesCotes) !== somme(lesLignes)) {
			v.push({ invariant: 'P2', message: `${nom} : les montants ne sont pas égaux.` });
		}
		const pointable = compte?.type === 'banque' || compte?.type === 'epargne';
		if (p.coteIds.length === 0 || p.ligneReleveIds.length === 0 || !pointable) {
			v.push({ invariant: 'P3', message: `${nom} : incomplet, ou sur un Compte non pointable.` });
		}
		if (lesLignes.some((l) => l.doublon === 'a_confirmer')) {
			v.push({ invariant: 'P4', message: `${nom} : relie une ligne à confirmer.` });
		}
		if (p.coteIds.some((id) => annules.has(id))) {
			v.push({ invariant: 'O8', message: `${nom} : relie une Opération annulée.` });
		}
		return v;
	});
}

function violationsExercices(j: GrandJournal): Violation[] {
	const v: Violation[] = [];
	const tenus = j.exercices
		.filter((e) => e.statut !== 'repere')
		.sort((a, b) => a.anneeDebut - b.anneeDebut);
	if (tenus.filter((e) => e.statut === 'ouvert').length > 2) {
		v.push({ invariant: 'E1', message: 'Plus de deux Exercices sont ouverts.' });
	}
	tenus.forEach((e, i) => {
		const suivant = tenus[i + 1];
		if (e.statut === 'ouvert' && suivant?.statut === 'cloture') {
			v.push({
				invariant: 'E3',
				message: `${suivant.libelle} est clôturé avant ${e.libelle}.`,
				exercice: suivant.libelle
			});
		}
		if (suivant && ajouterJours(e.fin as DateCivile, 1) !== suivant.debut) {
			v.push({ invariant: 'E1', message: `${e.libelle} et ${suivant.libelle} ne se suivent pas.` });
		}
	});
	const premier = tenus[0];
	for (const r of j.exercices.filter((e) => e.statut === 'repere')) {
		if (premier && r.anneeDebut >= premier.anneeDebut) {
			v.push({ invariant: 'E2', message: `Le repère ${r.libelle} suit un Exercice tenu.` });
		}
	}
	for (const a of j.ancres) {
		const e = j.exercices.find((x) => x.id === a.exerciceId);
		if (e === undefined || e.statut === 'repere') {
			v.push({ invariant: 'E6', message: `L'ancre du Compte ${a.compteId} est mal posée.` });
		}
	}
	return v;
}

function violationsReleve(j: GrandJournal): Violation[] {
	return j.lignesReleve.flatMap((l) => {
		const ancre = j.ancres.find((a) => a.compteId === l.compteId);
		const debut = j.exercices.find((e) => e.id === ancre?.exerciceId)?.debut;
		const v: Violation[] = [];
		if (debut && l.date < debut) {
			v.push({ invariant: 'P6', message: `Ligne de relevé ${l.id} antérieure à l'ancre.` });
		}
		if (Math.abs(l.montant) > MONTANT_MAX) {
			v.push({
				invariant: 'P6',
				message: `Ligne de relevé ${l.id} : montant démesuré, à retirer de son import.`
			});
		}
		return v;
	});
}

function violationsCreances(j: GrandJournal): Violation[] {
	return j.creancesDettes.flatMap((c) => {
		const actifs = c.reglements.filter((r) => j.operations.some((o) => o.id === r.operationId));
		return somme(actifs) > c.montant
			? [{ invariant: 'F1', message: `Les règlements dépassent la somme ${c.id}.` }]
			: [];
	});
}

export function verifierJournal(
	j: GrandJournal,
	parametrageDe: (e: Exercice) => ParametrageEtats,
	sessionsRouvertes: ReadonlySet<number> = new Set()
): Violation[] {
	const equations = j.exercices
		.filter((e) => e.statut !== 'repere')
		.flatMap((e) =>
			anomaliesEquation(equationDeControle(j, e, parametrageDe(e))).map((a) => ({
				invariant: 'Équation de contrôle',
				message: messageAnomalie(a),
				exercice: e.libelle
			}))
		);
	return [
		...j.operations.flatMap((op) => violationsOperation(j, op)),
		...violationsPointage(j),
		...violationsExercices(j),
		...violationsReleve(j),
		...violationsCreances(j),
		...violationsCaisses(j, sessionsRouvertes),
		...violationsCheques(j),
		...equations
	];
}
