/**
 * Shared lint-staged tasks. lefthook runs lint-staged from each app directory, so these
 * commands use that app's scripts.
 * @type {import('lint-staged').Configuration}
 */
const checkRedirectThrows = (filenames: string[]) =>
	`node scripts/check-redirect-throws.mjs ${filenames.map((f) => `"${f}"`).join(' ')}`;

export const lintStagedBase = {
	'*.{js,ts,svelte}': ['pnpm run fmt', "sh -c 'pnpm run lint'"],
	'*.svelte': "sh -c 'svelte-check --threshold error'",
	'*.{json,md,css,html,svg}': ['pnpm run fmt'],
	'**/+{page,layout}.server.{ts,js}': checkRedirectThrows,
	'**/+server.{ts,js}': checkRedirectThrows
};
