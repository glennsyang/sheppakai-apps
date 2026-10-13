import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			org: 'sheppakai',
			project: 'sheppakai-budget',
			authToken: process.env.SENTRY_AUTH_TOKEN
		}),
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// Nonce-based CSP: eliminates unsafe-inline from script-src.
			// Sentry's sentryHandle() automatically reads the nonce SvelteKit generates.
			// Shared strategy + per-app allowances: docs/CSP.md at the repo root (single source of truth).
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					// No unsafe-eval or unsafe-inline: layerchart/d3-scale/d3-shape do not use
					// Function() or eval(); nonce-based CSP covers SvelteKit-injected scripts and
					// the theme pre-paint script in src/app.html (nonce="%sveltekit.nonce%").
					'script-src': ['self'],
					// <style> elements: SvelteKit nonce covers SSR-injected ones.
					// unsafe-inline also required for chart libraries (layerchart) that inject
					// <style> elements at runtime after SSR, where no nonce is available.
					'style-src-elem': ['self', 'unsafe-inline'],
					// style="" attributes: unsafe-inline required for dynamic CSS custom
					// properties (e.g. bits-ui --bits-collapsible-content-height, chart colour
					// vars) whose values are computed at runtime and cannot be hashed.
					'style-src-attr': ['unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
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
			exclude: [
				'src/**/*.test.ts',
				'src/**/*.d.ts',
				'src/routes/**',
				'src/lib/components/ui/**',
				'src/app.ts',
				'src/service-worker/**'
			],
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
