import { application } from '#lib/server/composition.ts';
import { exiger } from '#lib/server/http.ts';
import { MIME, reponseFichier } from '#lib/server/telechargement.ts';

/** Validée : le PDF stocké, tel quel (F7). Brouillon : un aperçu de ce qui est enregistré. */
export async function GET({ locals, params, url }) {
	const app = application();
	const ctx = app.ctx(locals.acces);
	const type = url.searchParams.has('telecharger') ? 'attachment' : 'inline';
	const { facture } = exiger(app.factures.detail(ctx, Number(params.id)));
	if (facture.valideLe !== null) {
		const { octets, nom } = exiger(app.factures.fichier(ctx, facture.id));
		return reponseFichier(octets, { mime: MIME.pdf, nom, type });
	}
	const modele = exiger(app.factures.apercu(ctx, facture));
	return reponseFichier(await app.socle.exporteurs.pdf(modele), {
		mime: MIME.pdf,
		nom: `${modele.nomFichier}.pdf`,
		type
	});
}
