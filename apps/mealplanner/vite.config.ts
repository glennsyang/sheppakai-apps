import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { applyTestEnv } from '@sheppakai/shared/env';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// SvelteKit validates env at config time; give Vitest valid values (CI has no .env).
applyTestEnv();

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			org: 'sheppakai',
			project: 'sheppakai-mealplanner',
			authToken: process.env.SENTRY_AUTH_TOKEN
		}),
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			// Nonce-based CSP. SvelteKit generates a per-request nonce, injects it into the
			// inline <script>/<style> it emits during SSR, and sets the Content-Security-Policy
			// header itself — hooks.server.ts must NOT set that header. Shared strategy and
			// the per-app allowance table live in docs/CSP.md (repo root).
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					// script-src 'self' only: this app has no charts (no layerchart/d3). The nonce
					// covers SvelteKit's SSR-injected scripts and the pre-paint dark-mode script in
					// app.html (nonce="%sveltekit.nonce%"). The sveltekit-superforms -> arktype
					// (@ark/util) one-shot `new Function("return false")()` probe on first import is
					// meant to be blocked (arktype catches it and runs jitless); do NOT add 'unsafe-eval'.
					'script-src': ['self'],
					// unsafe-inline retained: Svelte injects inline <style> during SSR for scoped CSS.
					// fonts.googleapis.com: Google Fonts stylesheet loaded in app.html.
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					// No remote images: icons and favicons are served same-origin.
					'img-src': ['self', 'data:'],
					// fonts.gstatic.com: Google Fonts files referenced by the app.html stylesheet.
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'connect-src': ['self', 'https://*.ingest.us.sentry.io', 'https://*.ingest.sentry.io'],
					'frame-ancestors': ['none'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self']
				}
			}
		})
	],
	server: {
		watch: {
			ignored: ['**/data/**', '**/node_modules/**']
		}
	},
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,svelte.ts}'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/routes/**', 'src/app.ts'],
			reporter: ['text', 'lcov', 'html', 'json-summary', 'json'],
			thresholds: {
				statements: 40,
				branches: 40,
				functions: 40,
				lines: 40
			}
		},
		reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default']
	}
});
