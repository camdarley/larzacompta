import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ out: 'build' }),
			compilerOptions: { runes: true },
			// Réglée ici et non en hook : Kit pose lui-même le nonce sur ses scripts.
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['none'],
					'script-src': ['self', 'strict-dynamic'],
					'style-src': ['self'],
					// Attributs style= posés par Bits UI pour le positionnement. Pas de <style> ni de script.
					'style-src-attr': ['unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'manifest-src': ['self'],
					'form-action': ['self'],
					'base-uri': ['none'],
					'frame-ancestors': ['none'],
					'object-src': ['none']
				}
			}
		})
	],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'domaine',
					environment: 'node',
					include: ['tests/domaine/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'application',
					environment: 'node',
					include: ['tests/application/**/*.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'projet',
					environment: 'node',
					include: ['tests/projet/**/*.test.ts']
				}
			}
		],
		coverage: {
			provider: 'v8',
			include: ['src/lib/domaine/**/*.ts'],
			thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 }
		}
	}
});
