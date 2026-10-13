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
			project: 'synapse',
			authToken: process.env.SENTRY_AUTH_TOKEN
		}),
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// Nonce-based CSP. SvelteKit generates a per-request nonce, injects it into the
			// inline <script>/<style> it emits during SSR, and sets the Content-Security-Policy
			// header itself — hooks.server.ts must NOT set that header. Shared strategy and
			// the per-app allowance table live in docs/CSP.md (repo root).
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					// No unsafe-eval: layerchart/d3-scale/d3-shape do not use Function()/eval();
					// the nonce covers SvelteKit-injected scripts and the dark-mode pre-paint script
					// in app.html (mode-watcher's own head script is disabled — it can't get the nonce).
					// sveltekit-superforms -> arktype (@ark/util) fires a one-shot
					// `new Function("return false")()` CSP probe on first import — CSP blocks it
					// (expected), ArkType catches it and runs jitless
					// for the session. The console warning is benign; do NOT add 'unsafe-eval'.
					'script-src': ['self'],
					// <style> elements: nonce covers SSR-injected ones. unsafe-inline retained for
					// chart-style.svelte, which injects <style> at runtime after SSR (no nonce
					// available). fonts.googleapis.com: Google Fonts stylesheet loaded in app.html.
					'style-src-elem': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					// style="" attributes: unsafe-inline for runtime-computed CSS custom properties
					// (bits-ui, chart colour vars) that cannot be hashed ahead of time.
					'style-src-attr': ['unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'connect-src': [
						'self',
						'https://*.ingest.us.sentry.io',
						'https://*.ingest.sentry.io',
						'https://nominatim.openstreetmap.org',
						'https://api.open-meteo.com'
					],
					'manifest-src': ['self'],
					'worker-src': ['self'],
					'frame-ancestors': ['none'],
					'frame-src': ['none'],
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
		include: ['src/**/*.{test,spec}.{js,ts}'],
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
