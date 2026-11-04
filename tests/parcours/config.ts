import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PORT_E2E = 4173;
export const ORIGINE_E2E = `http://localhost:${PORT_E2E}`;
export const DOSSIER_E2E = join(tmpdir(), 'ape-compta-e2e');
