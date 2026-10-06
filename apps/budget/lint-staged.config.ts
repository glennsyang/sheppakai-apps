/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
	'*.{js,ts,svelte}': ['pnpm run fmt', "sh -c 'pnpm run lint'"],
	'*.svelte': "sh -c 'svelte-check --threshold error'",
	'*.{json,md,css,html,svg}': ['pnpm run fmt'],
	'**/+{page,layout}.server.{ts,js}': (filenames: string[]) =>
		`node scripts/check-redirect-throws.mjs ${filenames.map((f) => `"${f}"`).join(' ')}`,
	'**/+server.{ts,js}': (filenames: string[]) =>
		`node scripts/check-redirect-throws.mjs ${filenames.map((f) => `"${f}"`).join(' ')}`
};
