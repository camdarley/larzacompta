import { defineConfig, devices } from '@playwright/test';
import { DOSSIER_E2E, ORIGINE_E2E, PORT_E2E } from './tests/parcours/config.ts';

export default defineConfig({
	testDir: 'tests/parcours',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	timeout: 30_000,
	use: {
		baseURL: ORIGINE_E2E,
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris',
		// Tient lieu de Caddy : adapter-node 6 déduit l'origine de cet en-tête, https par défaut.
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// Chaque campagne repart d'une base temporaire vide, hors du dépôt.
		command: `rm -rf "${DOSSIER_E2E}" && mkdir -p "${DOSSIER_E2E}" && node build/index.js`,
		url: `${ORIGINE_E2E}/sante`,
		reuseExistingServer: false,
		stdout: 'pipe',
		env: {
			APE_DONNEES: DOSSIER_E2E,
			ORIGIN: ORIGINE_E2E,
			PROTOCOL_HEADER: 'x-forwarded-proto',
			BODY_SIZE_LIMIT: '25M',
			PORT: String(PORT_E2E),
			HOST: '127.0.0.1',
			TZ: 'Europe/Paris'
		}
	}
});
