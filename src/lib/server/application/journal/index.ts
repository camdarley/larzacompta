import type { DateCivile, Instant } from '#lib/domaine/dates.ts';
import { ajouterJours } from '#lib/domaine/dates.ts';
import type { Resultat } from '#lib/domaine/resultat.ts';
import type { Ctx, Lire, Socle } from '../executer.ts';
import type { EntreeJournal, FiltresJournal } from '../ports.ts';

export const TAILLE_PAGE = 50;

export type PageJournal = {
	entrees: EntreeJournal[];
	total: number;
	page: number;
	pages: number;
	personnes: string[];
	types: string[];
};

/** Début d'un jour civil à Paris, en instant UTC : Paris est toujours à UTC+1 ou UTC+2. */
function bornes(ctx: { du?: DateCivile; au?: DateCivile }) {
	const instant = (d: DateCivile): Instant => {
		// Marge d'une heure côté sûr : un filtre de période ne doit perdre aucune ligne du jour.
		return `${ajouterJours(d, -1)}T22:00:00.000Z`;
	};
	return {
		depuis: ctx.du ? instant(ctx.du) : undefined,
		jusqua: ctx.au ? instant(ajouterJours(ctx.au, 1)) : undefined
	};
}

/** Aucun journal n'atteint cette page, et le décalage reste un entier sûr pour SQLite. */
const borne = (page: number) => Math.min(page, Math.floor(Number.MAX_SAFE_INTEGER / TAILLE_PAGE));

export function creerJournal(socle: Socle, lire: Lire) {
	const depot = socle.depots.journal;
	return {
		lister(ctx: Ctx, filtres: FiltresJournal, page: number): Resultat<PageJournal> {
			return lire(ctx, 'consulter', () => {
				const numero = Number.isSafeInteger(page) ? Math.max(1, page) : 1;
				const { entrees, total } = depot.lister(
					{ personne: filtres.personne, type: filtres.type, ...bornes(filtres) },
					{ limite: TAILLE_PAGE, decalage: (borne(numero) - 1) * TAILLE_PAGE }
				);
				return {
					entrees,
					total,
					page: numero,
					pages: Math.max(1, Math.ceil(total / TAILLE_PAGE)),
					personnes: depot.personnes(),
					types: depot.types()
				};
			});
		}
	};
}

export type ModuleJournal = ReturnType<typeof creerJournal>;
