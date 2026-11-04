import { mkdirSync, rmSync } from 'node:fs';
import { DOSSIER_E2E } from './config.ts';

/** Chaque campagne repart d'une base temporaire vide, hors du dépôt. */
export default function preparation() {
	rmSync(DOSSIER_E2E, { recursive: true, force: true });
	mkdirSync(DOSSIER_E2E, { recursive: true });
}
