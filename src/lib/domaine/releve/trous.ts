/** Trou de dates entre les imports d'un Compte : seul indice d'un relevé oublié. */
import { ajouterJours, nomDuMois, type DateCivile } from '../dates.ts';

/** Au-delà de trois semaines sans ligne, un relevé manque peut-être. Une APE a des creux plus courts. */
export const SEUIL_TROU_JOURS = 21;

export type Periode = { dateMin: DateCivile; dateMax: DateCivile };
export type Trou = { debut: DateCivile; fin: DateCivile };

export function trous(periodes: readonly Periode[]): Trou[] {
	const triees = [...periodes].sort((a, b) => a.dateMin.localeCompare(b.dateMin));
	const [premiere] = triees;
	if (premiere === undefined) return [];
	const resultat: Trou[] = [];
	let fin = premiere.dateMax;
	for (const p of triees) {
		if (p.dateMin > ajouterJours(fin, SEUIL_TROU_JOURS)) {
			resultat.push({ debut: fin, fin: p.dateMin });
		}
		if (p.dateMax > fin) fin = p.dateMax;
	}
	return resultat;
}

function jourEtMois(date: DateCivile) {
	const [, mois = 0, jour = 0] = date.split('-').map(Number);
	return { jour: jour === 1 ? '1er' : String(jour), mois: nomDuMois(mois) };
}

/** `{ debut: '3', fin: '28 mars' }`, ou le mois des deux côtés s'ils diffèrent. */
export function bornesTrou(t: Trou): { debut: string; fin: string } {
	const a = jourEtMois(t.debut);
	const b = jourEtMois(t.fin);
	return {
		debut: a.mois === b.mois ? a.jour : `${a.jour} ${a.mois}`,
		fin: `${b.jour} ${b.mois}`
	};
}
