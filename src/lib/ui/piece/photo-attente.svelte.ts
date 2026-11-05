/**
 * L'appareil photo ne s'ouvre que sur un geste de la personne : l'entrée Photo de `barre-mobile`
 * l'ouvre elle-même, et `/pieces/photo` reprend ici le cliché pris pendant la navigation.
 */
export const photoAttendue = $state<{ fichier: File | null }>({ fichier: null });
