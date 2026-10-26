import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AWAKE_GRACE_MS,
	createAwakeTracker,
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
		const response = wakePageResponse();
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
});

describe('raceWithWakeScreen', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('returns the real response when it arrives in time', async () => {
		const real = new Response('page');
		const result = raceWithWakeScreen(Promise.resolve(real));

		await expect(result).resolves.toBe(real);
	});

	it('returns the wake page when the server is slow', async () => {
		const slow = new Promise<Response>(() => {});
		const result = raceWithWakeScreen(slow);

		await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS);

		expect(await (await result).text()).toContain('Waking up Synapse');
	});

	it('propagates a fetch error that happens before the timeout', async () => {
		const result = raceWithWakeScreen(Promise.reject(new TypeError('offline')));

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
