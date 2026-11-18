/** Trou de dates entre les imports d'un Compte : seul indice d'un relevé oublié. */
import { ajouterJours, formaterJourMois, type DateCivile } from '../dates.ts';

/** Au-delà de trois semaines sans ligne, un relevé manque peut-être. Une association a des creux plus courts. */
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

/** `{ debut: '3', fin: '28 mars' }`, ou le mois des deux côtés s'ils diffèrent. */
export function bornesTrou(t: Trou): { debut: string; fin: string } {
	const debut = formaterJourMois(t.debut);
	const fin = formaterJourMois(t.fin);
	const memeMois = t.debut.slice(0, 7) === t.fin.slice(0, 7);
	return { debut: memeMois ? (debut.split(' ')[0] as string) : debut, fin };
}
