import { TAILLE_MAX_PIECE, type PieceDeposee } from '#lib/domaine/pieces/index.ts';
import { envoyerFichierSuivi, type Reponse } from '#lib/ui/api.ts';
import { reduirePhoto } from './photo.ts';

export type OptionsDepot = {
	operationId?: number | null;
	/** Créance ou Dette : la facture reçue avant le paiement. */
	creanceId?: number | null;
	progres?: (part: number) => void;
};

/** Réduit une photo, puis l'envoie. Le serveur reste seul juge du format et de la taille. */
export async function deposerPiece(
	fichier: File,
	options: OptionsDepot = {}
): Promise<Reponse<PieceDeposee>> {
	const pret = await reduirePhoto(fichier);
	// Trop lourd même réduit : inutile de l'envoyer pour l'entendre dire.
	if (pret.size > TAILLE_MAX_PIECE) return { type: 'refus', erreur: { code: 'piece_refusee' } };
	const corps = new FormData();
	corps.set('fichier', pret);
	if (options.operationId) corps.set('operationId', String(options.operationId));
	else if (options.creanceId) corps.set('creanceId', String(options.creanceId));
	return envoyerFichierSuivi<PieceDeposee>('/api/pieces', corps, options.progres ?? (() => {}));
}
