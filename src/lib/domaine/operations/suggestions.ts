/**
 * Suggestion de Nature et d'Action d'après les Opérations passées (FR-42).
 * Elle préremplit, elle n'enregistre jamais.
 */
import { nomDuMois, type DateCivile } from '../dates.ts';
import type { GrandJournal, LigneJ } from '../journal.ts';
import type { Action, Nature } from '../parametrage.ts';
import type { Intention } from './formes.ts';

export type Suggestion = {
	natureId: number;
	actionId: number | null;
	libelle: string;
	date: DateCivile;
};

/** Sans accents ni casse : « Écoles » et « ecoles » sont le même mot. */
export function normaliser(texte: string): string {
	return texte
		.normalize('NFD')
		.replace(/\p{Mn}/gu, '')
		.toLocaleLowerCase('fr')
		.trim();
}

const LONGUEUR_MIN = 3;

function ligneDominante(lignes: readonly LigneJ[], intention: Intention) {
	const candidates = lignes.filter((l) =>
		intention === 'depense' ? l.montant < 0 : l.montant > 0
	);
	return [...candidates].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant))[0];
}

export function suggerer(
	j: Pick<GrandJournal, 'operations'>,
	p: {
		natures: readonly Pick<Nature, 'id' | 'actif' | 'codeSysteme'>[];
		actions: readonly Pick<Action, 'id' | 'actif'>[];
	},
	texte: string,
	intention: Intention
): Suggestion | null {
	const saisie = normaliser(texte);
	if (saisie.length < LONGUEUR_MIN) return null;

	const proches = j.operations
		.filter((o) => {
			const libelle = normaliser(o.libelle);
			return (
				o.genre !== 'interne' &&
				(libelle.includes(saisie) || saisie.includes(libelle)) &&
				ligneDominante(o.lignes, intention) !== undefined
			);
		})
		.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

	const op = proches[0];
	if (op === undefined) return null;
	const ligne = ligneDominante(op.lignes, intention) as LigneJ;

	const nature = p.natures.find((n) => n.id === ligne.natureId);
	if (nature === undefined || !nature.actif || nature.codeSysteme !== null) return null;
	if (ligne.actionId !== null) {
		const action = p.actions.find((a) => a.id === ligne.actionId);
		if (action === undefined || !action.actif) return null;
	}
	return { natureId: ligne.natureId, actionId: ligne.actionId, libelle: op.libelle, date: op.date };
}

/** « Comme “Autocars du Sud” en mars » */
export function noteSuggestion(s: Pick<Suggestion, 'libelle' | 'date'>): string {
	const mois = Number(s.date.slice(5, 7));
	return `Comme “${s.libelle}” en ${nomDuMois(mois)}`;
}
