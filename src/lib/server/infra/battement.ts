/**
 * Preuve de vie du serveur, dans `/data` : `docker compose run` ne voit pas les process du service
 * `app`, seulement leur volume. `ape restaurer` s'y fie pour refuser de tourner à côté d'eux.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const nom = (dossier: string) => join(dossier, 'serveur-en-marche');

export function ecrireBattement(dossier: string, maintenant: string) {
	const temporaire = `${nom(dossier)}.tmp`;
	writeFileSync(temporaire, maintenant);
	renameSync(temporaire, nom(dossier));
}

export function lireBattement(dossier: string): string | null {
	return existsSync(nom(dossier)) ? readFileSync(nom(dossier), 'utf8').trim() : null;
}

export function effacerBattement(dossier: string) {
	rmSync(nom(dossier), { force: true });
}
