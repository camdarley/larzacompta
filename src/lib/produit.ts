import paquet from '../../package.json' with { type: 'json' };

/** Nom de travail du produit : un seul paramètre à changer (DESIGN.md). */
export const NOM_PRODUIT = 'APE Compta';

/** Version de ce build, seule source : `package.json`. */
export const VERSION = paquet.version;

export const LICENCE = 'AGPL-3.0';

/**
 * Page lue une fois par jour (AD-21), sans identifiant. Elle rend `{ "tag_name": "v1.2.3" }`
 * ou `{ "version": "1.2.3" }`. À poser à la publication du projet : tant qu'elle manque, aucun appel.
 */
export const URL_VERSIONS = '';
