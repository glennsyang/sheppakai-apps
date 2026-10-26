import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AWAKE_GRACE_MS,
	createAwakeTracker,
	createWakeScreenHandler,
	raceWithWakeScreen,
	shouldIntercept,
	WAKE_TIMEOUT_MS,
	wakePageResponse
} from './wake-screen';

const ORIGIN = 'https://synapse.example.com';

function navigation(path: string, init: { method?: string; mode?: RequestMode } = {}) {
	// `mode: 'navigate'` can't be set through the Request constructor, so fake the shape.
	return {
		url: `${ORIGIN}${path}`,
		method: init.method ?? 'GET',
		mode: init.mode ?? 'navigate'
	} as Request;
}

describe('shouldIntercept', () => {
	it('intercepts same-origin page navigations', () => {
		expect(shouldIntercept(navigation('/'), ORIGIN)).toBe(true);
		expect(shouldIntercept(navigation('/sign-in'), ORIGIN)).toBe(true);
	});

	it('ignores non-GET, non-navigate, API and cross-origin requests', () => {
		expect(shouldIntercept(navigation('/sign-in', { method: 'POST' }), ORIGIN)).toBe(false);
		expect(shouldIntercept(navigation('/', { mode: 'cors' }), ORIGIN)).toBe(false);
		expect(shouldIntercept(navigation('/api/healthz'), ORIGIN)).toBe(false);
		expect(shouldIntercept(navigation('/'), 'https://other.example.com')).toBe(false);
	});
});

describe('wakePageResponse', () => {
	it('serves a self-refreshing, script-free page', async () => {
		const response = wakePageResponse('Synapse');
		const html = await response.text();

		expect(response.headers.get('Content-Type')).toContain('text/html');
		expect(response.headers.get('Content-Security-Policy')).toBe(
			"default-src 'none'; style-src 'unsafe-inline'"
		);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(html).toContain('<meta http-equiv="refresh" content="2">');
		expect(html).toContain('Waking up Synapse');
		expect(html).not.toContain('<script');
	});

	it('escapes the app name', async () => {
		expect(await wakePageResponse('<b>&</b>').text()).toContain(
			'Waking up &lt;b&gt;&amp;&lt;/b&gt;'
		);
	});
});

describe('raceWithWakeScreen', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('returns the real response when it arrives in time', async () => {
		const real = new Response('page');
		const result = raceWithWakeScreen(Promise.resolve(real), 'Synapse');

		await expect(result).resolves.toBe(real);
	});

	it('returns the wake page when the server is slow', async () => {
		const slow = new Promise<Response>(() => {});
		const result = raceWithWakeScreen(slow, 'Synapse');

		await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS);

		expect(await (await result).text()).toContain('Waking up Synapse');
	});

	it('propagates a fetch error that happens before the timeout', async () => {
		const result = raceWithWakeScreen(Promise.reject(new TypeError('offline')), 'Synapse');

		await expect(result).rejects.toThrow('offline');
	});
});

describe('createAwakeTracker', () => {
	it('is recently awake only within the grace period', () => {
		let now = 1_000;
		const tracker = createAwakeTracker(() => now);

		expect(tracker.isRecentlyAwake()).toBe(false);

		tracker.markAwake();
		expect(tracker.isRecentlyAwake()).toBe(true);

		now += AWAKE_GRACE_MS;
		expect(tracker.isRecentlyAwake()).toBe(false);
	});
});

describe('createWakeScreenHandler', () => {
	afterEach(() => vi.unstubAllGlobals());

	function fetchEvent(request: Request) {
		return {
			request,
			waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
			respondWith: vi.fn<(response: Promise<Response>) => void>()
		};
	}

	it('answers navigations, then stands aside once the server has responded', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response('page')))
		);
		const handle = createWakeScreenHandler('Budget');

		const first = fetchEvent(navigation('/'));
		expect(handle(first, ORIGIN)).toBe(true);
		expect(first.respondWith).toHaveBeenCalledOnce();
		await first.waitUntil.mock.calls[0][0];

		expect(handle(fetchEvent(navigation('/')), ORIGIN)).toBe(false);
	});

	it('ignores requests it should not intercept', () => {
		const handle = createWakeScreenHandler('Budget');
		const event = fetchEvent(navigation('/api/healthz'));

		expect(handle(event, ORIGIN)).toBe(false);
		expect(event.respondWith).not.toHaveBeenCalled();
	});
});
