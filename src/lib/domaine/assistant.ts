/** Étapes de l'assistant de démarrage, écrites dans `association.etape_assistant`. */
export const ETAPES_ASSISTANT = [
	'Votre association',
	'Vos Comptes',
	'Natures et Actions',
	'Vos sommes en cours'
] as const;

/** Étape « Vos sommes en cours », la dernière. Elle se passe. */
export const ETAPE_ASSISTANT_SOMMES = 4;

/** Au-delà de la dernière étape. */
export const ETAPE_ASSISTANT_TERMINE = 5;
