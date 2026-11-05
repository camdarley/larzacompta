/**
 * Modèles des documents : tout y est déjà calculé, le rendu PDF ou XLSX n'additionne rien (AD-18).
 * Aucun modèle n'emploie débit, crédit, écriture ni contrepartie (AD-6).
 */
import { formaterDateLongue, type DateCivile } from '../dates.ts';
import type { Exercice } from '../exercices.ts';
import { centimes, type Centimes } from '../montant.ts';
import { messageAnomalie } from './anomalies.ts';
import type { CarteCompte } from './controle.ts';
import type {
	Anomalie,
	CompteDeResultat,
	NoeudAction,
	NoeudGroupe,
	NoeudNature,
	ResultatParAction,
	Totaux
} from './resultat.ts';
import type { EtatTresorerie } from './tresorerie.ts';

/** `signe` : `+ 200,00 €`. Sans lui, un montant de colonne. Vide : `null`. */
export type Cellule = string | { montant: Centimes; signe?: boolean } | null;

export type RangeeDocument = {
	cellules: Cellule[];
	/** Décalage du libellé : 0 pour un Groupe ou un total. */
	niveau: number;
	/** Groupe, sous-total : en graisse appuyée. */
	fort?: boolean;
	/** Trait au-dessus, comme une addition posée. */
	total?: boolean;
};

export type TableauDocument = {
	legende: string;
	colonnes: { libelle: string; montant: boolean }[];
	rangees: RangeeDocument[];
};

export type SectionDocument = {
	titre: string;
	phrases: string[];
	tableau: TableauDocument | null;
};

export type ModeleDocument = {
	titre: string;
	association: string;
	exercice: string;
	/** Filigrane : l'Exercice n'est pas clôturé. */
	provisoire: boolean;
	nomFichier: string;
	sections: SectionDocument[];
};

const COLONNES_RESULTAT = [
	{ libelle: 'Libellé', montant: false },
	{ libelle: 'Recettes', montant: true },
	{ libelle: 'Dépenses', montant: true },
	{ libelle: 'Résultat', montant: true }
];

function rangee(libelle: string, t: Totaux, niveau: number, fort = false): RangeeDocument {
	return {
		cellules: [
			libelle,
			{ montant: t.recettes },
			{ montant: t.depenses },
			{ montant: t.resultat, signe: true }
		],
		niveau,
		fort
	};
}

const rangeesNatures = (natures: readonly NoeudNature[], niveau: number) =>
	natures.map((n) => rangee(n.libelle, n, niveau));

function rangeesAction(a: NoeudAction, niveau: number, detail: boolean): RangeeDocument[] {
	return [rangee(a.libelle, a, niveau), ...(detail ? rangeesNatures(a.natures, niveau + 1) : [])];
}

function rangeesGroupes(groupes: readonly NoeudGroupe[], detail: boolean): RangeeDocument[] {
	return groupes.flatMap((g) => [
		rangee(g.libelle, g, 0, true),
		...g.actions.flatMap((a) => rangeesAction(a, 1, detail)),
		...rangeesNatures(g.sansAction, 1)
	]);
}

const rangeeTotal = (libelle: string, t: Totaux): RangeeDocument => ({
	...rangee(libelle, t, 0, true),
	total: true
});

const phrasesAnomalies = (anomalies: readonly Anomalie[]) => anomalies.map(messageAnomalie);

function sectionsResultat(cr: CompteDeResultat, detail: boolean): SectionDocument[] {
	const sections: SectionDocument[] = [
		{
			titre: 'Compte de résultat',
			phrases: [
				'Ce que l’Exercice a rapporté et coûté, par Groupe.',
				...phrasesAnomalies(cr.anomalies)
			],
			tableau: {
				legende: 'Compte de résultat',
				colonnes: COLONNES_RESULTAT,
				rangees: [...rangeesGroupes(cr.groupes, detail), rangeeTotal('Résultat de l’Exercice', cr)]
			}
		}
	];
	if (cr.anterieurs.groupes.length > 0) sections.push(sectionAnterieurs(cr.anterieurs, detail));
	return sections;
}

function sectionAnterieurs(b: CompteDeResultat['anterieurs'], detail: boolean): SectionDocument {
	return {
		titre: 'Sur Exercices antérieurs',
		phrases: ['Ces sommes bougent la trésorerie de l’Exercice, sans compter dans son résultat.'],
		tableau: {
			legende: 'Sur Exercices antérieurs',
			colonnes: COLONNES_RESULTAT,
			rangees: [...rangeesGroupes(b.groupes, detail), rangeeTotal('Total hors résultat', b)]
		}
	};
}

function sectionsTresorerie(t: EtatTresorerie): SectionDocument[] {
	const colonne = (libelle: string, montant = true) => ({ libelle, montant });
	const ligne = (libelle: string, montant: Centimes, signe = false): RangeeDocument => ({
		cellules: [libelle, { montant, signe }],
		niveau: 0
	});
	const x = t.explication;
	return [
		{
			titre: 'État de trésorerie',
			phrases: [
				'Ce que l’APE possédait au début et à la fin de l’Exercice, Compte par Compte.',
				...phrasesAnomalies(t.anomalies)
			],
			tableau: {
				legende: 'État de trésorerie',
				colonnes: [
					colonne('Compte', false),
					colonne('Départ'),
					colonne('Fin'),
					colonne('Variation')
				],
				rangees: [
					...t.comptes.map((c) => ({
						cellules: [
							c.libelle,
							{ montant: c.depart },
							{ montant: c.fin },
							{ montant: c.variation, signe: true }
						],
						niveau: 0
					})),
					{
						cellules: [
							'Total',
							{ montant: t.depart },
							{ montant: t.fin },
							{ montant: t.variation, signe: true }
						],
						niveau: 0,
						fort: true,
						total: true
					}
				]
			}
		},
		{
			titre: 'Créances et Dettes',
			phrases: ['Restes dus à la fin de l’Exercice, hors trésorerie.'],
			tableau: {
				legende: 'Créances et Dettes',
				colonnes: [colonne('Reste dû', false), colonne('Montant')],
				rangees: [ligne('Ce que l’APE attend', t.creances), ligne('Ce que l’APE doit', t.dettes)]
			}
		},
		{
			titre: 'Explication résultat et variation',
			phrases: ['Pourquoi la trésorerie n’a pas bougé exactement du résultat.'],
			tableau: {
				legende: 'Explication résultat et variation',
				colonnes: [colonne('Terme', false), colonne('Montant')],
				rangees: [
					ligne('Résultat de l’Exercice', x.resultat, true),
					ligne('Lignes sur Exercices antérieurs', x.anterieures, true),
					ligne('Natures neutres', x.neutres, true),
					ligne('Mouvements internes en transit', x.transit, true),
					{
						cellules: ['Variation de trésorerie', { montant: x.variation, signe: true }],
						niveau: 0,
						fort: true,
						total: true
					}
				]
			}
		}
	];
}

function entete(titre: string, nomFichier: string, e: Exercice, association: string) {
	return {
		titre,
		association,
		exercice: e.libelle,
		provisoire: e.statut !== 'cloture',
		nomFichier: `${nomFichier}-${e.libelle}`
	};
}

export function modeleCompteDeResultat(
	cr: CompteDeResultat,
	e: Exercice,
	association: string
): ModeleDocument {
	return {
		...entete('Compte de résultat', 'compte-de-resultat', e, association),
		sections: sectionsResultat(cr, true)
	};
}

export function modeleTresorerie(
	t: EtatTresorerie,
	e: Exercice,
	association: string
): ModeleDocument {
	return {
		...entete('État de trésorerie', 'etat-de-tresorerie', e, association),
		sections: sectionsTresorerie(t)
	};
}

export function modeleActions(
	r: ResultatParAction,
	e: Exercice,
	association: string
): ModeleDocument {
	const sections: SectionDocument[] = [
		{
			titre: 'Résultat par Action',
			phrases: phrasesAnomalies(r.anomalies),
			tableau: {
				legende: 'Résultat par Action',
				colonnes: COLONNES_RESULTAT,
				rangees: [
					...rangeesGroupes(r.groupes, true),
					...(r.sansAction.length > 0
						? [
								rangee('Sans Action', r.sansActionTotaux, 0, true),
								...rangeesNatures(r.sansAction, 1)
							]
						: []),
					rangeeTotal('Résultat de l’Exercice', r)
				]
			}
		}
	];
	if (r.anterieurs.groupes.length > 0) sections.push(sectionAnterieurs(r.anterieurs, true));
	return { ...entete('Résultat par Action', 'actions', e, association), sections };
}

export function modeleAction(a: NoeudAction, e: Exercice, association: string): ModeleDocument {
	return {
		...entete(a.libelle, `action-${a.actionId}`, e, association),
		sections: [
			{
				titre: a.libelle,
				phrases: [],
				tableau: {
					legende: a.libelle,
					colonnes: COLONNES_RESULTAT,
					rangees: [
						...a.natures.flatMap((n) => [
							rangee(n.libelle, n, 0, true),
							...n.lignes.map((l) => ({
								cellules: [
									`${formaterDateLongue(l.date)}, ${l.libelle}`,
									null,
									null,
									{ montant: l.montant, signe: true }
								],
								niveau: 1
							}))
						]),
						rangeeTotal('Résultat de l’Action', a)
					]
				}
			}
		]
	};
}

function sectionEcarts(cartes: readonly CarteCompte[]): SectionDocument {
	const restants = cartes.filter((c) => c.ecart !== null && c.ecart !== 0);
	return {
		titre: 'Écarts restants',
		phrases:
			restants.length === 0
				? ['Aucun Écart : chaque solde calculé égale le solde constaté.']
				: ['Différences entre le solde calculé et le solde constaté, à la dernière comparaison.'],
		tableau:
			restants.length === 0
				? null
				: {
						legende: 'Écarts restants',
						colonnes: [
							{ libelle: 'Compte', montant: false },
							{ libelle: 'Comparé le', montant: false },
							{ libelle: 'Écart', montant: true }
						],
						rangees: restants.map((c) => ({
							cellules: [
								c.compte.libelle,
								formaterDateLongue(c.date),
								{ montant: centimes(c.ecart as number), signe: true }
							],
							niveau: 0
						}))
					}
	};
}

export type EntreeDocumentAg = {
	exercice: Exercice;
	association: string;
	resultat: CompteDeResultat;
	tresorerie: EtatTresorerie;
	cartes: readonly CarteCompte[];
};

/** Deux Exercices au même paramétrage gardent les mêmes Groupes, dans le même ordre (FR-33). */
export function modeleDocumentAg(d: EntreeDocumentAg): ModeleDocument {
	const e = d.exercice;
	const periode =
		e.debut && e.fin
			? `Du ${formaterDateLongue(e.debut as DateCivile)} au ${formaterDateLongue(e.fin as DateCivile)}.`
			: '';
	const [resultat, ...suite] = sectionsResultat(d.resultat, false);
	return {
		...entete('Document d’assemblée générale', 'document-ag', e, d.association),
		sections: [
			{
				...(resultat as SectionDocument),
				phrases: [periode, ...(resultat as SectionDocument).phrases].filter(Boolean)
			},
			...suite,
			...sectionsTresorerie(d.tresorerie),
			sectionEcarts(d.cartes)
		]
	};
}
