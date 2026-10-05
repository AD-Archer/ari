import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['private/**'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint says not to use no-undef on typescript projects
			'no-undef': 'off',
			'capitalized-comments': ['error', 'never', { ignorePattern: 'FROZEN' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// object keys and type members are left alone: wire payloads and oauth pin snake_case there
		files: ['**/*.ts', '**/*.svelte', '**/*.svelte.ts'],
		rules: {
			'@typescript-eslint/naming-convention': [
				'error',
				{ selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
				{ selector: 'variable', format: ['camelCase', 'PascalCase'] },
				{
					selector: 'variable',
					modifiers: ['exported'],
					filter: '^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$',
					format: null
				},
				{ selector: 'function', format: ['camelCase', 'PascalCase'] },
				{ selector: 'import', format: ['camelCase', 'PascalCase'] },
				{ selector: 'typeLike', format: ['PascalCase'] },
				{ selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
				{ selector: ['objectLiteralProperty', 'typeProperty'], format: null },
				{ selector: ['objectLiteralMethod', 'typeMethod'], format: null }
			],
			'id-length': [
				'error',
				{ min: 3, properties: 'never', exceptions: ['id', 'db', 'to', 'at', 'ok', 'on', 'x', 'y'] }
			]
		}
	},
	{
		files: ['**/*.svelte'],
		rules: { 'svelte/no-inline-styles': ['error', { allowTransitions: true }] }
	}
);
