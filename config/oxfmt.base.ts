import { defineConfig } from 'oxfmt';

// Shared oxfmt settings for every app. Each app's oxfmt.config.ts spreads this, so ignore
// patterns resolve against the app directory (`/static` means `apps/<app>/static`).
export const oxfmtBase = defineConfig({
	arrowParens: 'always',
	ignorePatterns: [
		'.claude',
		'.fallow',
		'.svelte-kit',
		'.wrangler',
		'build',
		'coverage',
		'data',
		'node_modules',
		'/static',
		'/drizzle',
		'src/lib/components/ui/',
		'/AGENTS.md',
		'*.toml'
	],
	printWidth: 100,
	semi: true,
	singleQuote: true,
	sortImports: true,
	sortTailwindcss: true,
	svelte: true,
	tabWidth: 2,
	trailingComma: 'none',
	useTabs: true
});
