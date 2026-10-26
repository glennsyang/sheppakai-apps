import { self as serviceWorker } from '$app/service-worker';

import {
	createAwakeTracker,
	raceWithWakeScreen,
	shouldIntercept
} from '#lib/service-worker/wake-screen.js';

const awake = createAwakeTracker();

serviceWorker.addEventListener('install', () => {
	void serviceWorker.skipWaiting();
});

serviceWorker.addEventListener('activate', (event) => {
	event.waitUntil(serviceWorker.clients.claim());
});

// Show a "waking up" page when a navigation stalls on a Fly cold start.
serviceWorker.addEventListener('fetch', (event) => {
	if (!shouldIntercept(event.request, serviceWorker.location.origin)) return;
	if (awake.isRecentlyAwake()) return;

	const fetchPromise = fetch(event.request);
	// Keep the original request alive so it finishes booting the machine.
	event.waitUntil(fetchPromise.then(() => awake.markAwake()).catch(() => {}));
	event.respondWith(raceWithWakeScreen(fetchPromise));
});
