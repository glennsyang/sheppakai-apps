/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
	'*.{js,ts,svelte}': ['pnpm run fmt', "sh -c 'pnpm run lint'"],
	'*.svelte': "sh -c 'svelte-check --threshold error'",
	// CLAUDE.md/AGENTS.md and package-lock.json are excluded here to match oxfmt.config.ts's
	// ignorePatterns — oxfmt errors when given only an ignored file as its sole target, which
	// otherwise blocks lockfile-only commits (e.g. a transitive security bump).
	'!(package-lock).json': ['pnpm run fmt'],
	'*.{css,html,svg}': ['pnpm run fmt'],
	'!(CLAUDE|AGENTS).md': ['pnpm run fmt'],
	'**/+{page,layout}.server.{ts,js}': (filenames: string[]) =>
		`node scripts/check-redirect-throws.mjs ${filenames.map((f) => `"${f}"`).join(' ')}`,
	'**/+server.{ts,js}': (filenames: string[]) =>
		`node scripts/check-redirect-throws.mjs ${filenames.map((f) => `"${f}"`).join(' ')}`
};
