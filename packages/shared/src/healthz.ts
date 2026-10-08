/**
 * `GET /api/healthz` for Fly.io's health checks. A 200 means the volume is mounted and the
 * SQLite file is readable; a 503 marks the instance unhealthy.
 */
export function createHealthzHandler(options: {
	getDb: () => { run(query: string): unknown };
	logger: { error(message: string, error?: unknown): void };
}) {
	const { getDb, logger } = options;

	return async (): Promise<Response> => {
		try {
			getDb().run('SELECT 1');

			return new Response('OK', { status: 200, headers: { 'Cache-Control': 'no-cache' } });
		} catch (e) {
			logger.error('Health check failed', e);

			return new Response('Service Unavailable', { status: 503 });
		}
	};
}
