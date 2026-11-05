/** Sauvegarde (AD-17) : copie cohérente de la base, puis restic sur cette copie et sur les fichiers. */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RETENTION } from '#lib/domaine/exploitation.ts';
import type { Archiveur } from '../../application/ports.ts';
import type { Base } from '../sqlite/connexion.ts';
import type { Restic } from './restic.ts';

export const HOTE = 'ape';
export const ETIQUETTE = 'ape';
/** Chemin de la copie, relatif au dossier des données : la restauration le retrouve. */
export const COPIE = join('sauvegardes', 'copie', 'base.sqlite');

function instantaneDe(sortie: string): string | null {
	for (const ligne of sortie.trim().split('\n').reverse()) {
		try {
			const message = JSON.parse(ligne) as { message_type?: string; snapshot_id?: string };
			if (message.message_type === 'summary') return message.snapshot_id ?? null;
		} catch {
			// Restic mêle parfois une ligne de texte à son JSON : elle ne dit rien d'utile ici.
		}
	}
	return null;
}

export function creerArchiveur(base: Base, dossier: string, restic: Restic): Archiveur {
	const copie = join(dossier, COPIE);
	const fichiers = join(dossier, 'fichiers');

	return {
		horsVps: restic.horsVps,
		async sauvegarder({ controler }) {
			await restic.assurerDepot();
			mkdirSync(fichiers, { recursive: true });
			mkdirSync(join(copie, '..'), { recursive: true });
			rmSync(copie, { force: true });
			try {
				await base.backup(copie);
				// Dans cet ordre : un fichier est écrit avant sa ligne en base, et ne change jamais.
				const sortie = await restic.lancer([
					'backup',
					'--json',
					'--host',
					HOTE,
					'--tag',
					ETIQUETTE,
					copie,
					fichiers
				]);
				await restic.lancer([
					'forget',
					'--quiet',
					'--host',
					HOTE,
					'--tag',
					ETIQUETTE,
					'--keep-daily',
					String(RETENTION.quotidiennes),
					'--keep-monthly',
					String(RETENTION.mensuelles),
					'--keep-yearly',
					String(RETENTION.annuelles),
					'--prune'
				]);
				if (controler) await restic.lancer(['check', '--quiet']);
				return { instantane: instantaneDe(sortie) };
			} finally {
				// La copie n'est pas chiffrée : elle ne reste pas sur le disque.
				rmSync(copie, { force: true });
			}
		}
	};
}
