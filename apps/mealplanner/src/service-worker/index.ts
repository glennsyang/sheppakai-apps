import { self as serviceWorker } from '$app/service-worker';
import { createWakeScreenHandler } from '@sheppakai/shared/wake-screen';

const handleWakeScreen = createWakeScreenHandler('Meal Planner');

serviceWorker.addEventListener('install', () => {
	void serviceWorker.skipWaiting();
});

serviceWorker.addEventListener('activate', (event) => {
	event.waitUntil(serviceWorker.clients.claim());
});

// Show a "waking up" page when a navigation stalls on a Fly cold start.
serviceWorker.addEventListener('fetch', (event) => {
	handleWakeScreen(event, serviceWorker.location.origin);
});
