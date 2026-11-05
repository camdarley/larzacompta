/**
 * Avant envoi, le navigateur réduit une photo à 2000 px en JPEG (AD-16). Redessiner l'image retire
 * ses métadonnées, position GPS comprise. Le code s'exécute dans le navigateur, sans dépendance.
 */
export const COTE_MAX_PHOTO = 2000;
const QUALITE = 0.85;

function vers(blob: Blob, nom: string) {
	const base = nom.replace(/\.[^.]*$/, '') || 'photo';
	return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

/** Si le navigateur ne sait pas décoder le fichier, il part en l'état : le serveur décidera. */
export async function reduirePhoto(fichier: File): Promise<File> {
	if (!fichier.type.startsWith('image/')) return fichier;
	let image: ImageBitmap;
	try {
		image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
	} catch {
		return fichier;
	}
	const echelle = Math.min(1, COTE_MAX_PHOTO / Math.max(image.width, image.height));
	const toile = document.createElement('canvas');
	toile.width = Math.round(image.width * echelle);
	toile.height = Math.round(image.height * echelle);
	const contexte = toile.getContext('2d');
	if (contexte === null) return fichier;
	contexte.drawImage(image, 0, 0, toile.width, toile.height);
	image.close();
	const blob = await new Promise<Blob | null>((resoudre) =>
		toile.toBlob(resoudre, 'image/jpeg', QUALITE)
	);
	return blob === null ? fichier : vers(blob, fichier.name);
}
