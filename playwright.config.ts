import { defineConfig, devices } from '@playwright/test';
import { DOSSIER_E2E, ORIGINE_E2E, PORT_E2E } from './tests/parcours/config.ts';

export default defineConfig({
	testDir: 'tests/parcours',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	timeout: 30_000,
	globalSetup: './tests/parcours/preparation.ts',
	use: { baseURL: ORIGINE_E2E, locale: 'fr-FR', timezoneId: 'Europe/Paris' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node build/index.js',
		url: `${ORIGINE_E2E}/sante`,
		reuseExistingServer: false,
		stdout: 'pipe',
		env: {
			APE_DONNEES: DOSSIER_E2E,
			ORIGIN: ORIGINE_E2E,
			PORT: String(PORT_E2E),
			HOST: '127.0.0.1',
			TZ: 'Europe/Paris'
		}
	}
});
