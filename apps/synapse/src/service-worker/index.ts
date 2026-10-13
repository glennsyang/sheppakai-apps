import { self as serviceWorker } from '$app/service-worker';

serviceWorker.addEventListener('install', () => {
	void serviceWorker.skipWaiting();
});

serviceWorker.addEventListener('activate', (event) => {
	event.waitUntil(serviceWorker.clients.claim());
});
