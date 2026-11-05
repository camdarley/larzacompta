/** État de trésorerie : pour chaque Compte, départ, fin, variation (FR-31, AD-12). */
import { resteDu } from '../creances/index.ts';
import type { DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import type { GrandJournal } from '../journal.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';
import type { TypeCompte } from '../parametrage.ts';
import {
	anomaliesEquation,
	equationDeControle,
	type Anomalie,
	type Explication,
	type ParametrageEtats
} from './resultat.ts';
import { soldeCompte, soldeDepart } from './soldes.ts';

export type LigneTresorerie = {
	compteId: number;
	libelle: string;
	type: TypeCompte;
	depart: Centimes;
	fin: Centimes;
	variation: Centimes;
};

export type EtatTresorerie = {
	exerciceId: number;
	comptes: LigneTresorerie[];
	depart: Centimes;
	fin: Centimes;
	variation: Centimes;
	/** Reste dû à la fin de l'Exercice : hors trésorerie, donné au total. */
	creances: Centimes;
	dettes: Centimes;
	explication: Explication;
	anomalies: Anomalie[];
};

type JournalTresorerie = Pick<
	GrandJournal,
	'operations' | 'exercices' | 'ancres' | 'comptes' | 'creancesDettes'
>;

/** Un Compte ancré plus tard n'existait pas encore. Un Compte désactivé à zéro ne dit plus rien. */
function comptesDe(j: JournalTresorerie, e: Exercice, p: ParametrageEtats): LigneTresorerie[] {
	const fin = e.fin as DateCivile;
	const anneeAncre = (compteId: number) => {
		const id = j.ancres.find((a) => a.compteId === compteId)?.exerciceId;
		return j.exercices.find((x) => x.id === id)?.anneeDebut ?? e.anneeDebut;
	};
	return [...p.comptes]
		.sort((a, b) => a.ordre - b.ordre || a.id - b.id)
		.filter((c) => anneeAncre(c.id) <= e.anneeDebut)
		.flatMap((c) => {
			const depart = soldeDepart(j, c.id, e);
			const solde = soldeCompte(j, c.id, fin);
			const discret = !c.actif || c.type === 'cheques_a_remettre';
			if (discret && depart === 0 && solde === 0) return [];
			return [
				{
					compteId: c.id,
					libelle: c.libelle,
					type: c.type,
					depart,
					fin: solde,
					variation: centimes(solde - depart)
				}
			];
		});
}

export function etatTresorerie(
	j: JournalTresorerie,
	e: Exercice,
	p: ParametrageEtats
): EtatTresorerie {
	const fin = e.fin as DateCivile;
	const comptes = comptesDe(j, e, p);
	const restes = (sens: 'creance' | 'dette') =>
		sommeCentimes(
			j.creancesDettes
				.filter((c) => c.sens === sens && c.date <= fin)
				.map((c) => resteDu(c, j, fin, p.clotureLe ?? null))
		);
	const explication = equationDeControle(j, e, p);
	return {
		exerciceId: e.id,
		comptes,
		depart: sommeCentimes(comptes.map((c) => c.depart)),
		fin: sommeCentimes(comptes.map((c) => c.fin)),
		variation: sommeCentimes(comptes.map((c) => c.variation)),
		creances: restes('creance'),
		dettes: restes('dette'),
		explication,
		anomalies: anomaliesEquation(explication)
	};
}
