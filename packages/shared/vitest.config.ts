import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	// sveltekit-rate-limiter only exports under the `svelte` condition, which the apps'
	// sveltekit() plugin adds for them.
	ssr: { resolve: { conditions: ['svelte'] } },
	resolve: {
		alias: {
			'$app/server': fileURLToPath(new URL('./test/app-server-stub.ts', import.meta.url))
		}
	},
	test: {
		// Inline both so vite (not Node) resolves them: the alias above then applies to
		// superforms' `import '$app/server'`, and the `svelte` condition to the limiter.
		server: { deps: { inline: ['sveltekit-superforms', 'sveltekit-rate-limiter'] } }
	}
});
