/**
 * Rangées d'une `ligne-depliable` : l'arbre d'un état mis à plat selon ce qui est déplié.
 * L'état déplié vit dans l'URL (AD-19) : `?ouvert=g1,a3,a3-n5`, rendu identique côté serveur.
 */
import type { DateCivile } from '../dates.ts';
import type { PieceJ } from '../journal.ts';
import type { Centimes } from '../montant.ts';
import {
	totauxDe,
	type LigneEtat,
	type NoeudAction,
	type NoeudGroupe,
	type NoeudNature,
	type Totaux
} from './resultat.ts';

export type TypeRangee = 'groupe' | 'action' | 'nature' | 'ligne' | 'section';

export type Rangee = Totaux & {
	cle: string;
	parent: string | null;
	niveau: number;
	/** Position parmi ses sœurs, pour `aria-posinset` et `aria-setsize`. */
	rang: number;
	freres: number;
	type: TypeRangee;
	libelle: string;
	depliable: boolean;
	deplie: boolean;
	/** Page dédiée : une Action. */
	actionId?: number;
	/** Rien sur l'Exercice regardé : ses montants restent vides, jamais à zéro (FR-34). */
	absent?: boolean;
	/** Résultat de chaque Exercice comparé. `null` : absent de cet Exercice. */
	comparaisons?: (Centimes | null)[];
	ligne?: {
		operationId: number;
		date: DateCivile;
		pieces: PieceJ[];
		exerciceRattachementId: number;
	};
};

export type Noeud = Totaux & {
	cle: string;
	type: TypeRangee;
	libelle: string;
	actionId?: number;
	absent?: boolean;
	comparaisons?: (Centimes | null)[];
	ligne?: LigneEtat;
	enfants: Noeud[];
};

const noeudLigne = (l: LigneEtat, parent: string): Noeud => ({
	cle: `${parent}-l${l.id}`,
	type: 'ligne',
	libelle: l.libelle,
	...totauxDe([l]),
	ligne: l,
	enfants: []
});

export function noeudNature(n: NoeudNature, parent: string): Noeud {
	const cle = `${parent}-n${n.natureId}`;
	const { recettes, depenses, resultat, libelle } = n;
	return {
		cle,
		type: 'nature',
		libelle,
		recettes,
		depenses,
		resultat,
		enfants: n.lignes.map((l) => noeudLigne(l, cle))
	};
}

export function noeudAction(a: NoeudAction): Noeud {
	const cle = `a${a.actionId}`;
	const { recettes, depenses, resultat, libelle, actionId } = a;
	return {
		cle,
		type: 'action',
		libelle,
		actionId,
		recettes,
		depenses,
		resultat,
		enfants: a.natures.map((n) => noeudNature(n, cle))
	};
}

export function noeudGroupe(g: NoeudGroupe): Noeud {
	const cle = `g${g.groupeId}`;
	const { recettes, depenses, resultat, libelle } = g;
	return {
		cle,
		type: 'groupe',
		libelle,
		recettes,
		depenses,
		resultat,
		enfants: [...g.actions.map(noeudAction), ...g.sansAction.map((n) => noeudNature(n, cle))]
	};
}

/** Bloc « Sur Exercices antérieurs » : ses clés ne se mêlent pas à celles du tableau principal. */
export function noeudAnterieur(g: NoeudGroupe): Noeud {
	const prefixer = (n: Noeud): Noeud => ({
		...n,
		cle: `x-${n.cle}`,
		enfants: n.enfants.map(prefixer)
	});
	return prefixer(noeudGroupe(g));
}

/** « Sans Action », à part, par Nature (écran Actions). */
export function noeudSansAction(natures: readonly NoeudNature[], t: Totaux): Noeud {
	const { recettes, depenses, resultat } = t;
	return {
		cle: 's',
		type: 'section',
		libelle: 'Sans Action',
		recettes,
		depenses,
		resultat,
		enfants: natures.map((n) => noeudNature(n, 's'))
	};
}

/** Seules les rangées dont tous les parents sont dépliés sont rendues. */
export function aplatir(
	noeuds: readonly Noeud[],
	ouvertes: ReadonlySet<string>,
	parent: string | null = null,
	niveau = 1
): Rangee[] {
	return noeuds.flatMap((n, i) => {
		const deplie = n.enfants.length > 0 && ouvertes.has(n.cle);
		const rangee: Rangee = {
			cle: n.cle,
			parent,
			niveau,
			rang: i + 1,
			freres: noeuds.length,
			type: n.type,
			libelle: n.libelle,
			recettes: n.recettes,
			depenses: n.depenses,
			resultat: n.resultat,
			depliable: n.enfants.length > 0,
			deplie,
			...(n.actionId === undefined ? {} : { actionId: n.actionId }),
			...(n.absent ? { absent: true } : {}),
			...(n.comparaisons ? { comparaisons: n.comparaisons } : {}),
			...(n.ligne
				? {
						ligne: {
							operationId: n.ligne.operationId,
							date: n.ligne.date,
							pieces: n.ligne.pieces,
							exerciceRattachementId: n.ligne.exerciceRattachementId
						}
					}
				: {})
		};
		return [rangee, ...(deplie ? aplatir(n.enfants, ouvertes, n.cle, niveau + 1) : [])];
	});
}

export function lireOuvertes(valeur: string | null): Set<string> {
	return new Set((valeur ?? '').split(',').filter((c) => /^[a-z0-9-]+$/.test(c)));
}

/** `?ouvert=` après bascule. Replier un parent replie aussi ce qu'il contenait. */
export function basculer(ouvertes: ReadonlySet<string>, cle: string): string {
	const suite = new Set(ouvertes);
	if (suite.has(cle)) {
		for (const c of suite) {
			if (c === cle || c.startsWith(`${cle}-`)) suite.delete(c);
		}
	} else {
		suite.add(cle);
	}
	return [...suite].join(',');
}
