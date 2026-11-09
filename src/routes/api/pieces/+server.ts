import { TAILLE_MAX_PIECE } from '#lib/domaine/pieces/index.ts';
import { echec } from '#lib/domaine/resultat.ts';
import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

/** Dépôt d'une Pièce. Le format se contrôle sur les octets, dans le domaine (AD-16). */
export async function POST({ request, locals }) {
	let formulaire: FormData;
	try {
		formulaire = await request.formData();
	} catch {
		return reponseJson(echec('piece_refusee'));
	}
	const fichier = formulaire.get('fichier');
	if (!(fichier instanceof File) || fichier.size === 0 || fichier.size > TAILLE_MAX_PIECE) {
		return reponseJson(echec('piece_refusee'));
	}
	const operation = Number(formulaire.get('operationId'));
	const somme = Number(formulaire.get('creanceId'));
	const app = application();
	return reponseJson(
		app.pieces.deposer(app.ctx(locals.acces), {
			nomOriginal: fichier.name,
			octets: new Uint8Array(await fichier.arrayBuffer()),
			operationId: Number.isInteger(operation) && operation > 0 ? operation : null,
			creanceId: Number.isInteger(somme) && somme > 0 ? somme : null
		})
	);
}
