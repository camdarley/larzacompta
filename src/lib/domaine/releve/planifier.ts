/**
 * Décide du sort de chaque ligne lue, sans rien écrire (AD-9). Le même chemin sert toutes les sources.
 * La protection vise deux dangers : doubler une ligne, et perdre une ligne réelle identique à une autre.
 */
import type { DateCivile } from '../dates.ts';
import { empreinteLigne } from './empreinte.ts';
import type { LigneNormalisee, ReleveNormalise } from './types.ts';

export type LigneConnue = { identifiantSource: string | null; empreinte: string };

export type LignePlanifiee = LigneNormalisee & {
	empreinte: string;
	doublon: 'non' | 'a_confirmer';
};

export type PlanImport = {
	lues: number;
	nouvelles: LignePlanifiee[];
	connues: number;
	/** Antérieures à l'ancre : hors contrôle (P6). */
	ecartees: number;
	dateMin: DateCivile | null;
	dateMax: DateCivile | null;
};

function compter(valeurs: readonly string[]): Map<string, number> {
	const n = new Map<string, number>();
	for (const v of valeurs) n.set(v, (n.get(v) ?? 0) + 1);
	return n;
}

export function planifierImport(
	releve: Pick<ReleveNormalise, 'lignes'>,
	existantes: readonly LigneConnue[],
	premierJour: DateCivile | null
): PlanImport {
	const gardees = releve.lignes.filter((l) => premierJour === null || l.date >= premierJour);
	const dates = gardees.map((l) => l.date).sort();

	const identifiants = new Set(existantes.flatMap((l) => l.identifiantSource ?? []));
	let connues = 0;
	const inconnues: (LigneNormalisee & { empreinte: string })[] = [];
	for (const l of gardees) {
		if (l.identifiant !== null && identifiants.has(l.identifiant)) {
			connues += 1;
			continue;
		}
		if (l.identifiant !== null) identifiants.add(l.identifiant);
		inconnues.push({ ...l, empreinte: empreinteLigne(l) });
	}

	const enBase = compter(existantes.map((l) => l.empreinte));
	const dansFichier = compter(inconnues.map((l) => l.empreinte));
	const reconnaissables = new Map(enBase);
	const nouvelles: LignePlanifiee[] = [];

	for (const l of inconnues) {
		const reste = reconnaissables.get(l.empreinte) ?? 0;
		// Un identifiant neuf sur une empreinte connue reste à confirmer : l'identifiant de la banque n'est pas garanti stable (OQ-7).
		if (l.identifiant === null && reste > 0) {
			reconnaissables.set(l.empreinte, reste - 1);
			connues += 1;
			continue;
		}
		const m = enBase.get(l.empreinte) ?? 0;
		const k = dansFichier.get(l.empreinte) ?? 0;
		nouvelles.push({ ...l, doublon: m >= 1 || k >= 2 ? 'a_confirmer' : 'non' });
	}

	return {
		lues: releve.lignes.length,
		nouvelles,
		connues,
		ecartees: releve.lignes.length - gardees.length,
		dateMin: dates[0] ?? null,
		dateMax: dates.at(-1) ?? null
	};
}

/**
 * Ligne saisie à la main : mêmes doublons, mais jamais ignorée en silence.
 * Elle vient d'un geste volontaire, et il lui faut une réponse visible.
 */
export function planifierSaisie(
	ligne: LigneNormalisee,
	existantes: readonly LigneConnue[]
): LignePlanifiee {
	const empreinte = empreinteLigne(ligne);
	const connue = existantes.some((l) => l.empreinte === empreinte);
	return { ...ligne, empreinte, doublon: connue ? 'a_confirmer' : 'non' };
}
