/**
 * Restauration (AD-17). Tourne sans application : elle ne touche ni la base ni ses migrations,
 * elle remet des fichiers en place. La vérification suit, par `ape verifier`.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { applicationEnMarche } from '#lib/domaine/exploitation.ts';
import { echec, succes, type Resultat } from '#lib/domaine/resultat.ts';
import { lireBattement } from '../battement.ts';
import { COPIE, ETIQUETTE, HOTE } from './index.ts';
import type { Restic } from './restic.ts';

export type OptionsRestauration = {
	instantane: string;
	/** Remplace une instance en place, gardée dans `avant-restauration/`. */
	remplacer: boolean;
	maintenant: string;
};

function vide(dossier: string) {
	return !existsSync(dossier) || readdirSync(dossier).length === 0;
}

/** Restic garde le chemin absolu d'origine : la copie se retrouve à sa fin de chemin, pas à sa place. */
function racineDe(dossier: string): string | null {
	if (existsSync(join(dossier, COPIE))) return dossier;
	for (const entree of readdirSync(dossier, { withFileTypes: true })) {
		if (!entree.isDirectory()) continue;
		const trouvee = racineDe(join(dossier, entree.name));
		if (trouvee !== null) return trouvee;
	}
	return null;
}

export async function restaurer(
	dossier: string,
	restic: Restic,
	options: OptionsRestauration
): Promise<Resultat<null>> {
	if (applicationEnMarche(lireBattement(dossier), options.maintenant)) {
		return echec('application_en_marche');
	}
	const base = join(dossier, 'base.sqlite');
	const fichiers = join(dossier, 'fichiers');
	const enPlace = existsSync(base) || !vide(fichiers);
	if (enPlace && !options.remplacer) return echec('instance_en_place');

	const temporaire = join(dossier, 'sauvegardes', 'restauration');
	rmSync(temporaire, { recursive: true, force: true });
	mkdirSync(temporaire, { recursive: true });
	try {
		const cible = options.instantane === 'latest' ? `latest` : options.instantane;
		await restic.lancer([
			'restore',
			cible,
			'--host',
			HOTE,
			'--tag',
			ETIQUETTE,
			'--target',
			temporaire,
			'--quiet'
		]);
		const racine = racineDe(temporaire);
		if (racine === null) return echec('sauvegarde_sans_base');

		if (enPlace) {
			const ancienne = join(dossier, 'avant-restauration', options.maintenant.replaceAll(':', '-'));
			mkdirSync(ancienne, { recursive: true });
			if (existsSync(base)) renameSync(base, join(ancienne, 'base.sqlite'));
			if (existsSync(fichiers)) renameSync(fichiers, join(ancienne, 'fichiers'));
		}
		for (const suffixe of ['-wal', '-shm']) rmSync(`${base}${suffixe}`, { force: true });
		rmSync(fichiers, { recursive: true, force: true });

		renameSync(join(racine, COPIE), base);
		const restaures = join(racine, 'fichiers');
		if (existsSync(restaures)) renameSync(restaures, fichiers);
		else mkdirSync(fichiers, { recursive: true });
		return succes(null);
	} finally {
		rmSync(temporaire, { recursive: true, force: true });
	}
}
