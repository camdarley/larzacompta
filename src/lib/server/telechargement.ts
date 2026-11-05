/** Un document servi en réponse : en-têtes communs aux PDF, XLSX et archives. */

export const MIME = {
	pdf: 'application/pdf',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	zip: 'application/zip',
	csv: 'text/csv; charset=utf-8'
} as const;

/** `filename*` : un nom accentué passe, et rien ne sort de la valeur de l'en-tête. */
export function disposition(type: 'inline' | 'attachment', nom: string) {
	const ascii = nom.replace(/[^\w.-]/g, '_');
	return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}

export function reponseFichier(
	contenu: Uint8Array | ReadableStream<Uint8Array>,
	o: { mime: string; nom: string; type: 'inline' | 'attachment' }
): Response {
	return new Response(contenu as Uint8Array<ArrayBuffer>, {
		headers: {
			'Content-Type': o.mime,
			// Un flux n'annonce pas sa taille : elle n'est connue qu'à la fin.
			...(contenu instanceof Uint8Array ? { 'Content-Length': String(contenu.length) } : null),
			'Content-Disposition': disposition(o.type, o.nom),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store',
			'Content-Security-Policy': "frame-ancestors 'self'"
		}
	});
}
