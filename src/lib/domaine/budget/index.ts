/**
 * Budget (FR-29). Le prévu se saisit, le réalisé se lit dans le Compte de résultat : rien de plus
 * n'est stocké (AD-4). Tout est en centimes entiers, seul le pourcentage d'affichage arrondit.
 */
import type { CompteDeResultat, NoeudNature, ParametrageEtats } from '../etats/resultat.ts';
import { centimes, sommeCentimes, type Centimes } from '../montant.ts';

export type SensBudget = 'recette' | 'depense';
export type PositionBudget = { actionId: number | null; natureId: number; sens: SensBudget };
export type LigneBudget = PositionBudget & { montant: Centimes };
/** Rangée à l'écran : `null` tant qu'aucun montant n'est prévu. */
export type LignePrevue = PositionBudget & { montant: Centimes | null };

export type EcartBudget = {
	prevu: Centimes | null;
	realise: Centimes;
	difference: Centimes;
	pourcentage: number | null;
};

export type RangeeBudget = PositionBudget &
	EcartBudget & {
		cle: string;
		libelle: string;
		/** Dépense au-delà de son prévu : À regarder, jamais rouge. Sans prévu, rien à dépasser. */
		depassement: boolean;
		/** Longueur de la petite barre, de 0 à 100. */
		part: number;
	};

export type BlocBudget = EcartBudget & {
	cle: string;
	actionId: number | null;
	libelle: string;
	depassement: boolean;
	rangees: RangeeBudget[];
};

export type VueBudget = {
	blocs: BlocBudget[];
	totaux: { recettes: EcartBudget; depenses: EcartBudget; resultat: EcartBudget };
};

const SANS_ACTION = 'Sans Action';
const LIBELLE_INCONNU = 'Non rangé';
const CENT = 100;
const MOINS = '−';
const INSECABLE = ' ';

export const cleBloc = (actionId: number | null) => (actionId === null ? 's' : `a${actionId}`);

export const cleBudget = (p: PositionBudget) => `${cleBloc(p.actionId)}-n${p.natureId}-${p.sens}`;

export function ecartBudget(prevu: Centimes | null, realise: Centimes): EcartBudget {
	const difference = centimes(realise - (prevu ?? 0));
	const pourcentage =
		prevu === null || prevu === 0 ? null : Math.round((difference * CENT) / Math.abs(prevu));
	return { prevu, realise, difference, pourcentage };
}

export function formaterPourcentage(p: number): string {
	const valeur = `${Math.abs(p)}${INSECABLE}%`;
	if (p === 0) return valeur;
	return `${p > 0 ? '+' : MOINS}${INSECABLE}${valeur}`;
}

function lignesNature(actionId: number | null, n: NoeudNature): LigneBudget[] {
	const position = { actionId, natureId: n.natureId };
	return [
		...(n.recettes === 0 ? [] : [{ ...position, sens: 'recette' as const, montant: n.recettes }]),
		...(n.depenses === 0 ? [] : [{ ...position, sens: 'depense' as const, montant: n.depenses }])
	];
}

/** Réalisé par position, lu dans le Compte de résultat : rien d'autre n'en calcule un (AD-4). */
export function realiseDe(cr: Pick<CompteDeResultat, 'groupes'>): LigneBudget[] {
	return cr.groupes.flatMap((g) => [
		...g.actions.flatMap((a) => a.natures.flatMap((n) => lignesNature(a.actionId, n))),
		...g.sansAction.flatMap((n) => lignesNature(null, n))
	]);
}

/** Une somme nette négative, ou une Action retirée depuis, ne se prévoit pas (FR-29). */
export function lignesDepuisRealise(
	realise: readonly LigneBudget[],
	actifs: { actions: ReadonlySet<number>; natures: ReadonlySet<number> }
): LigneBudget[] {
	return realise.filter(
		(l) =>
			l.montant > 0 &&
			actifs.natures.has(l.natureId) &&
			(l.actionId === null || actifs.actions.has(l.actionId))
	);
}

function partDe(prevu: Centimes | null, realise: Centimes): number {
	if (realise <= 0 || prevu === null) return 0;
	if (prevu === 0) return CENT;
	return Math.min(CENT, Math.round((realise * CENT) / prevu));
}

function rangee(
	p: PositionBudget,
	prevu: Centimes | null,
	realise: Centimes,
	libelle: string
): RangeeBudget {
	return {
		...p,
		...ecartBudget(prevu, realise),
		cle: cleBudget(p),
		libelle,
		depassement: p.sens === 'depense' && prevu !== null && realise > prevu,
		part: partDe(prevu, realise)
	};
}

const signe = (r: Pick<RangeeBudget, 'sens'>, montant: Centimes) =>
	centimes(r.sens === 'recette' ? montant : 0 - montant);

function somme(rangees: readonly RangeeBudget[], lire: (r: RangeeBudget) => Centimes) {
	return sommeCentimes(rangees.map(lire));
}

/** Résultat d'un ensemble : recettes moins dépenses. Vide si rien n'est prévu. */
function resultatDe(rangees: readonly RangeeBudget[]): EcartBudget {
	const prevues = rangees.filter((r) => r.prevu !== null);
	return ecartBudget(
		prevues.length === 0 ? null : somme(prevues, (r) => signe(r, r.prevu as Centimes)),
		somme(rangees, (r) => signe(r, r.realise))
	);
}

function colonne(rangees: readonly RangeeBudget[]): EcartBudget {
	const prevues = rangees.filter((r) => r.prevu !== null);
	return ecartBudget(
		prevues.length === 0 ? null : somme(prevues, (r) => r.prevu as Centimes),
		somme(rangees, (r) => r.realise)
	);
}

const ordreSens = (a: PositionBudget, b: PositionBudget) =>
	a.sens === b.sens ? 0 : a.sens === 'recette' ? -1 : 1;

export type EntreeVueBudget = {
	prevus: readonly LignePrevue[];
	realise: readonly LigneBudget[];
	parametrage: Pick<ParametrageEtats, 'groupes' | 'actions' | 'natures'>;
	/** Actions montrées même sans rangée, pour y ajouter une prévision. `null` : Sans Action. */
	vides?: readonly (number | null)[];
};

/** Prévu et réalisé réunis, Action puis Nature : un seul calcul pour l'écran et les exports. */
export function vueBudget(e: EntreeVueBudget): VueBudget {
	const { parametrage: p } = e;
	const positions = new Map<string, PositionBudget>();
	for (const l of [...e.prevus, ...e.realise]) {
		const { actionId, natureId, sens } = l;
		positions.set(cleBudget(l), { actionId, natureId, sens });
	}
	const prevus = new Map(e.prevus.map((l) => [cleBudget(l), l.montant]));
	const realises = new Map(e.realise.map((l) => [cleBudget(l), l.montant]));
	const libelleNature = (id: number) =>
		p.natures.find((n) => n.id === id)?.libelle ?? LIBELLE_INCONNU;

	const rangees = [...positions].map(([cle, position]) =>
		rangee(
			position,
			prevus.get(cle) ?? null,
			realises.get(cle) ?? centimes(0),
			libelleNature(position.natureId)
		)
	);
	const actionIds = new Set<number | null>([...(e.vides ?? []), ...rangees.map((r) => r.actionId)]);
	const ordreGroupe = (id: number | null) => {
		const action = p.actions.find((a) => a.id === id);
		return p.groupes.find((g) => g.id === action?.groupeId)?.ordre ?? Number.MAX_SAFE_INTEGER;
	};
	const blocs = [...actionIds]
		.map((actionId): BlocBudget & { ordre: number } => {
			const dela = rangees
				.filter((r) => r.actionId === actionId)
				.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr') || ordreSens(a, b));
			return {
				...resultatDe(dela),
				cle: cleBloc(actionId),
				actionId,
				libelle:
					actionId === null
						? SANS_ACTION
						: (p.actions.find((a) => a.id === actionId)?.libelle ?? LIBELLE_INCONNU),
				depassement: dela.some((r) => r.depassement),
				rangees: dela,
				ordre: actionId === null ? Number.POSITIVE_INFINITY : ordreGroupe(actionId)
			};
		})
		.sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'))
		.map(({ ordre: _, ...bloc }) => bloc);
	return {
		blocs,
		totaux: {
			recettes: colonne(rangees.filter((r) => r.sens === 'recette')),
			depenses: colonne(rangees.filter((r) => r.sens === 'depense')),
			resultat: resultatDe(rangees)
		}
	};
}
