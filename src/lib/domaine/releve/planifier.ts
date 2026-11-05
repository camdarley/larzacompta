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
	/** Identifiant déjà porté par une autre ligne : il n'est pas gardé (index unique), à confirmer. */
	identifiantRepete: boolean;
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

	const parIdentifiant = new Map(
		existantes.flatMap((l) =>
			l.identifiantSource === null ? [] : [[l.identifiantSource, l.empreinte] as const]
		)
	);
	const vus = new Set<string>();
	let connues = 0;
	const inconnues: (LigneNormalisee & { empreinte: string; identifiantRepete: boolean })[] = [];
	for (const l of gardees) {
		const empreinte = empreinteLigne(l);
		if (l.identifiant === null) {
			inconnues.push({ ...l, empreinte, identifiantRepete: false });
			continue;
		}
		const connue = parIdentifiant.get(l.identifiant);
		if (connue === empreinte) {
			connues += 1;
			continue;
		}
		// Un identifiant n'est pas garanti unique (OQ-7) : le même sur un autre contenu n'efface rien (FR-12).
		const identifiantRepete = connue !== undefined || vus.has(l.identifiant);
		vus.add(l.identifiant);
		inconnues.push({
			...l,
			identifiant: identifiantRepete ? null : l.identifiant,
			empreinte,
			identifiantRepete
		});
	}

	const enBase = compter(existantes.map((l) => l.empreinte));
	const dansFichier = compter(inconnues.map((l) => l.empreinte));
	const reconnaissables = new Map(enBase);
	// Une ligne à l'identifiant répété se retrouve seulement parmi les lignes gardées sans identifiant.
	const repetees = compter(
		existantes.flatMap((l) => (l.identifiantSource === null ? [l.empreinte] : []))
	);
	const nouvelles: LignePlanifiee[] = [];

	for (const l of inconnues) {
		const pile = l.identifiantRepete ? repetees : reconnaissables;
		const reste = pile.get(l.empreinte) ?? 0;
		// Un identifiant neuf sur une empreinte connue reste à confirmer : l'identifiant de la banque n'est pas garanti stable (OQ-7).
		if (l.identifiant === null && reste > 0) {
			pile.set(l.empreinte, reste - 1);
			connues += 1;
			continue;
		}
		const m = enBase.get(l.empreinte) ?? 0;
		const k = dansFichier.get(l.empreinte) ?? 0;
		nouvelles.push({
			...l,
			doublon: l.identifiantRepete || m >= 1 || k >= 2 ? 'a_confirmer' : 'non'
		});
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
	return { ...ligne, empreinte, doublon: connue ? 'a_confirmer' : 'non', identifiantRepete: false };
}
