/** Une anomalie dit ce qui ne tombe pas juste : elle s'affiche, elle ne masque aucun total. */
import { centimes, formaterMontant } from '../montant.ts';
import type { Anomalie } from './resultat.ts';

const SUITE = 'Les chiffres restent affichés. Prévenez la personne qui gère l’installation.';

export function messageAnomalie(a: Anomalie): string {
	if (a.code === 'anomalie_groupe') {
		const n = a.details.lignes;
		return `${n === 1 ? '1 Ligne n’a' : `${n} Lignes n’ont`} pas de Groupe connu. ${SUITE}`;
	}
	const montant = formaterMontant(centimes(Math.abs(a.details.difference)));
	return a.code === 'anomalie_equation'
		? `Le résultat et la variation de trésorerie diffèrent de ${montant} sans explication. ${SUITE}`
		: `La somme des Actions diffère du résultat de ${montant}. ${SUITE}`;
}
