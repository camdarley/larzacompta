import { echec } from '#lib/domaine/resultat.ts';
import { schemaReglage } from '#lib/schemas/pointage.ts';
import { valider } from '#lib/schemas/valider.ts';
import { application } from '#lib/server/composition.ts';
import { reponseJson } from '#lib/server/http.ts';

const TAILLE_MAX = 20 * 1024 * 1024;

function lireReglage(brut: string) {
	try {
		return valider(schemaReglage, JSON.parse(brut));
	} catch {
		return echec('fichier_illisible');
	}
}

export async function POST({ request, locals, params }) {
	let formulaire: FormData;
	try {
		formulaire = await request.formData();
	} catch {
		return reponseJson(echec('fichier_illisible'));
	}
	const fichier = formulaire.get('fichier');
	if (!(fichier instanceof File) || fichier.size === 0 || fichier.size > TAILLE_MAX) {
		return reponseJson(echec('fichier_illisible'));
	}

	let reglage = null;
	const brut = formulaire.get('reglage');
	if (typeof brut === 'string') {
		const lu = lireReglage(brut);
		if (!lu.ok) return reponseJson(lu);
		reglage = lu.valeur;
	}

	const app = application();
	return reponseJson(
		app.pointage.importer(app.ctx(locals.acces), {
			compteId: Number(params.compte),
			nomFichier: fichier.name,
			octets: new Uint8Array(await fichier.arrayBuffer()),
			reglage
		})
	);
}
