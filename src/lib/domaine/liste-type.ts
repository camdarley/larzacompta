/**
 * Liste type proposée à l'installation (FR-1, AD-24). Générique : aucune donnée propre à une APE.
 * Les Groupes par défaut sont ceux de FR-31.
 */
import type { CodeSysteme } from './parametrage.ts';

export const GROUPES_TYPE = [
	'Évènements',
	'Subventions',
	'Produits financiers',
	'Fonctionnement',
	'Communes',
	'Élémentaire',
	'Maternelle'
] as const;

export type GroupeType = (typeof GROUPES_TYPE)[number];

export const GROUPE_SYSTEME: GroupeType = 'Fonctionnement';
/** Groupe d'une Action créée à la volée. */
export const GROUPE_ACTIONS: GroupeType = 'Évènements';

export type NatureSysteme = { code: CodeSysteme; libelle: string; neutre: boolean };

export const NATURES_SYSTEME: readonly NatureSysteme[] = [
	{ code: 'ecart_caisse', libelle: 'Écart de caisse', neutre: false },
	{ code: 'ajustement', libelle: 'Ajustement', neutre: false },
	{ code: 'recette_especes', libelle: 'Recette d’espèces', neutre: false },
	{ code: 'somme_a_rendre', libelle: 'Somme à rendre', neutre: true }
];

export type NatureType = { libelle: string; groupe: GroupeType };

export const NATURES_TYPE: readonly NatureType[] = [
	{ libelle: 'Achats de marchandises', groupe: 'Fonctionnement' },
	{ libelle: 'Assurance', groupe: 'Fonctionnement' },
	{ libelle: 'Billetterie', groupe: 'Évènements' },
	{ libelle: 'Buvette', groupe: 'Évènements' },
	{ libelle: 'Communication', groupe: 'Fonctionnement' },
	{ libelle: 'Dons', groupe: 'Fonctionnement' },
	{ libelle: 'Frais bancaires', groupe: 'Fonctionnement' },
	{ libelle: 'Fournitures', groupe: 'Fonctionnement' },
	{ libelle: 'Intérêts', groupe: 'Produits financiers' },
	{ libelle: 'Location', groupe: 'Fonctionnement' },
	{ libelle: 'Prestations', groupe: 'Évènements' },
	{ libelle: 'Subvention', groupe: 'Subventions' },
	{ libelle: 'Transport', groupe: 'Fonctionnement' },
	{ libelle: 'Ventes', groupe: 'Évènements' }
];

export type ActionType = { libelle: string; groupe: GroupeType; avecCaisse: boolean };

export const ACTIONS_TYPE: readonly ActionType[] = [
	{ libelle: 'Kermesse', groupe: 'Évènements', avecCaisse: true },
	{ libelle: 'Loto', groupe: 'Évènements', avecCaisse: true },
	{ libelle: 'Marché de Noël', groupe: 'Évènements', avecCaisse: true },
	{ libelle: 'Spectacle de fin d’année', groupe: 'Évènements', avecCaisse: false },
	{ libelle: 'Sortie scolaire', groupe: 'Élémentaire', avecCaisse: false },
	{ libelle: 'Sortie des petits', groupe: 'Maternelle', avecCaisse: false }
];
