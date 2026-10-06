import { defineConfig } from 'oxfmt';

export default defineConfig({
	arrowParens: 'always',
	ignorePatterns: ['coverage', 'node_modules'],
	printWidth: 100,
	semi: true,
	singleQuote: true,
	sortImports: true,
	tabWidth: 2,
	trailingComma: 'none',
	useTabs: true
});
