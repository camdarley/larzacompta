import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (f: string) => readFileSync(f, 'utf8');

describe('Dockerfile', () => {
	const f = lire('Dockerfile');

	it('part de la bonne image, tourne sans root, et inclut restic vérifié', () => {
		expect(f.match(/^FROM .*$/gm)?.every((l) => l.includes('node:26.13.0-bookworm-slim'))).toBe(
			true
		);
		expect(f).toContain('RESTIC_VERSION=0.19.1');
		expect(f).toContain('sha256sum --check');
		expect(f).toMatch(/^USER node$/m);
		expect(f).toContain('/usr/local/bin/ape');
	});

	it('se réfère à /sante et active la sauvegarde', () => {
		expect(f).toContain('/sante');
		expect(f).toContain('APE_SAUVEGARDE=1');
	});
});

describe('compose.yaml', () => {
	const c = lire('compose.yaml');

	it('n’expose que Caddy, et fait tourner les logs', () => {
		const app = c.slice(c.indexOf('  app:'), c.indexOf('  caddy:'));
		expect(app).not.toMatch(/^\s+ports:/m);
		expect(c.slice(c.indexOf('  caddy:'))).toMatch(/^\s+ports:/m);
		expect(c).toContain('max-size');
		expect(c).toContain('max-file');
		expect(c).toContain('donnees:/data');
	});

	it('n’a ni champ `version` ni réplique', () => {
		expect(c).not.toMatch(/^version:/m);
		expect(c).not.toContain('replicas');
	});
});

describe('Caddyfile', () => {
	it('active HSTS et prend son adresse dans ORIGIN', () => {
		const c = lire('Caddyfile');
		expect(c).toContain('Strict-Transport-Security');
		expect(c).toContain('{$ORIGIN}');
		expect(c).toContain('reverse_proxy app:3000');
	});
});

describe('.env.example', () => {
	it('règle ce que demande la story', () => {
		const e = lire('.env.example');
		for (const cle of [
			'ORIGIN',
			'ADDRESS_HEADER',
			'XFF_DEPTH',
			'BODY_SIZE_LIMIT',
			'TZ',
			'RESTIC_PASSWORD',
			'RESTIC_REPOSITORY',
			'VERIFIER_VERSION'
		]) {
			expect(e).toMatch(new RegExp(`^${cle}=`, 'm'));
		}
	});

	it('n’embarque aucun secret', () => {
		expect(lire('.env.example')).toMatch(/^RESTIC_PASSWORD=$/m);
	});
});

describe('.dockerignore', () => {
	/** L'image sert son propre code : une donnée qui y entre serait téléchargeable. */
	it('est une liste blanche qui écarte les données', () => {
		const lignes = lire('.dockerignore')
			.split('\n')
			.filter((l) => l !== '' && !l.startsWith('#'));
		expect(lignes[0]).toBe('*');
		const admis = lignes.slice(1).join('\n');
		for (const interdit of ['.private', '_bmad', 'data', '.env\n', '*.ofx', '*.xlsx']) {
			expect(admis).not.toContain(`!${interdit}`);
		}
	});
});

describe('CI de version', () => {
	it('ne produit l’image qu’après le cycle complet', () => {
		const v = lire('.github/workflows/version.yml');
		expect(v.slice(v.indexOf('  cycle:'))).toContain('needs: verifier');
		expect(v.slice(v.indexOf('  image:'))).toContain('needs: cycle');
		expect(v).toContain('node tests/cycle/cycle.ts');
	});
});

describe('télémétrie', () => {
	it('aucune dépendance de mesure d’audience', () => {
		const deps = Object.keys(JSON.parse(lire('package.json')).dependencies).join(' ');
		expect(deps).not.toMatch(/sentry|posthog|analytics|telemetry|datadog/i);
	});
});
