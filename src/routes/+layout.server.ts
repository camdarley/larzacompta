import { NOM_PRODUIT } from '#lib/produit.ts';
import { application } from '#lib/server/composition.ts';

/** Nom affiché partout, connexion comprise. */
export function load() {
	const association = application().parametrage.association();
	return { nomApe: association?.nom ?? NOM_PRODUIT };
}
