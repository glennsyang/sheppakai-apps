/**
 * Cold-start "waking up" screen served by the service worker.
 *
 * Fly stops the machine when idle; the first request after that waits several
 * seconds for it to boot, during which the browser shows a blank tab. When a
 * page navigation takes longer than WAKE_TIMEOUT_MS, the service worker answers
 * with a small self-contained page that refreshes itself until the server is up.
 */

/** Warm page loads finish well under this; cold starts take 8–14s. */
export const WAKE_TIMEOUT_MS = 2500;

/**
 * After a navigation completes, skip the wake screen for this long. Stops a
 * refresh loop on a page that is legitimately slow while the server is warm.
 */
export const AWAKE_GRACE_MS = 60_000;

const WAKE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="2">
<title>Waking up - Synapse</title>
<style>
	:root { color-scheme: light dark; --bg: oklch(0.34 0.08 263); --fg: oklch(0.93 0.025 255); --muted: oklch(0.74 0.05 258); }
	@media (prefers-color-scheme: dark) { :root { --bg: oklch(0.17 0.025 263); --fg: oklch(0.9 0.02 255); --muted: oklch(0.66 0.04 258); } }
	body { margin: 0; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 0 16px; background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; text-align: center; }
	.spinner { width: 2.5rem; height: 2.5rem; border: 3px solid var(--muted); border-top-color: transparent; border-radius: 50%; animation: spin 0.9s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
	h1 { margin: 0; font-size: 1.125rem; font-weight: 700; }
	p { margin: 0; font-size: 0.875rem; color: var(--muted); }
</style>
</head>
<body>
<div class="spinner" role="status" aria-label="Loading"></div>
<h1>Waking up Synapse…</h1>
<p>This can take a few seconds.</p>
</body>
</html>`;

/** True for same-origin page navigations; API calls and everything else pass through. */
export function shouldIntercept(request: Request, origin: string): boolean {
	if (request.method !== 'GET' || request.mode !== 'navigate') return false;
	const url = new URL(request.url);
	return url.origin === origin && !url.pathname.startsWith('/api/');
}

export function wakePageResponse(): Response {
	return new Response(WAKE_PAGE_HTML, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
			'Cache-Control': 'no-store'
		}
	});
}

/**
 * Resolves with the real response if it arrives within `timeoutMs`, otherwise
 * with the wake page. A fetch error before the timeout propagates unchanged.
 */
export function raceWithWakeScreen(
	fetchPromise: Promise<Response>,
	timeoutMs: number = WAKE_TIMEOUT_MS
): Promise<Response> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<Response>((resolve) => {
		timer = setTimeout(() => resolve(wakePageResponse()), timeoutMs);
	});
	return Promise.race([fetchPromise, timeout]).finally(() => clearTimeout(timer));
}

/** Remembers when the server last answered a navigation. */
export function createAwakeTracker(now: () => number = Date.now) {
	let lastAwakeAt: number | undefined;
	return {
		markAwake() {
			lastAwakeAt = now();
		},
		isRecentlyAwake() {
			return lastAwakeAt !== undefined && now() - lastAwakeAt < AWAKE_GRACE_MS;
		}
	};
}
