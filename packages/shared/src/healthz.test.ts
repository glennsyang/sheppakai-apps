import { describe, expect, it, vi } from 'vitest';

import { createHealthzHandler } from './healthz';

describe('createHealthzHandler', () => {
	it('returns 200 when the database answers', async () => {
		const run = vi.fn();
		const GET = createHealthzHandler({ getDb: () => ({ run }), logger: { error: vi.fn() } });

		const response = await GET();

		expect(run).toHaveBeenCalledWith('SELECT 1');
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		expect(await response.text()).toBe('OK');
	});

	it('logs and returns 503 when the database is unreachable', async () => {
		const failure = new Error('volume not mounted');
		const logger = { error: vi.fn() };
		const GET = createHealthzHandler({
			getDb: () => {
				throw failure;
			},
			logger
		});

		const response = await GET();

		expect(response.status).toBe(503);
		expect(logger.error).toHaveBeenCalledWith('Health check failed', failure);
	});
});
