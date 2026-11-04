import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

const interditsDomaine = [
	{
		selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
		message: 'Le domaine reçoit le temps en paramètre (AD-1).'
	},
	{
		selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
		message: "Le domaine n'utilise pas d'aléa (AD-1)."
	},
	{
		selector: "NewExpression[callee.name='Date'][arguments.length=0]",
		message: "Le domaine ne lit pas l'horloge (AD-1)."
	}
];

export default [
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'_bmad/',
			'_bmad-output/',
			'.claude/',
			'.private/',
			'coverage/',
			'playwright-report/',
			'test-results/'
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			// La typographie française emploie des espaces insécables dans les textes et commentaires.
			'no-irregular-whitespace': [
				'error',
				{ skipStrings: true, skipComments: true, skipTemplates: true, skipRegExps: true }
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: tseslint.parser } }
	},
	{
		files: ['src/**/*'],
		rules: {
			// Les liens internes portent déjà leur chemin final : pas de base configurée (une instance par domaine).
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Le domaine n'importe que lui-même (AD-1).
		files: ['src/lib/domaine/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: '^(?!\\.{1,2}/|#lib/domaine/)',
							message: 'Le domaine ne dépend que de lui-même (AD-1).'
						}
					]
				}
			],
			'no-restricted-syntax': ['error', ...interditsDomaine]
		}
	},
	{
		// L'application passe par les ports (AD-1).
		files: ['src/lib/server/application/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['#lib/server/infra/*', 'node:*', 'better-sqlite3', '#lib/ui/*', '$app/*'],
							message: "L'application ne connaît que le domaine et les ports (AD-1)."
						}
					]
				}
			]
		}
	},
	{
		// Une route ou un composant ne touche jamais l'infrastructure (AD-1).
		files: ['src/routes/**/*', 'src/lib/ui/**/*', 'src/hooks.server.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['#lib/server/infra/*', '**/server/infra/*', 'better-sqlite3'],
							message: "Les routes et l'interface passent par composition.ts (AD-1)."
						}
					]
				}
			]
		}
	},
	{
		files: ['src/lib/ui/**/*'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['#lib/server/*', '**/server/*'],
							message: "L'interface n'importe rien du serveur (AD-1)."
						}
					]
				}
			]
		}
	}
];
