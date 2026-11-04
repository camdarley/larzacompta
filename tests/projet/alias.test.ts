import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('dépôt', () => {
	it('déclare #lib/* dans imports et épingle les versions exactes', () => {
		const p = JSON.parse(readFileSync('package.json', 'utf8'));
		expect(p.imports['#lib/*']).toBe('./src/lib/*');
		const versions = { ...p.dependencies, ...p.devDependencies } as Record<string, string>;
		const flottantes = Object.entries(versions).filter(([, v]) => /^[\^~]/.test(v));
		expect(flottantes).toEqual([]);
	});

	it('garde la licence AGPL-3.0 et exclut les données privées', () => {
		expect(readFileSync('LICENSE', 'utf8')).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
		const ignores = readFileSync('.gitignore', 'utf8');
		expect(ignores).toContain('.private/');
		expect(ignores).toContain('_bmad-output/');
	});
});
