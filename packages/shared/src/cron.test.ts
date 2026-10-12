import { describe, expect, it, vi } from 'vitest';

import { createCronHandler, verifyCronAuthorization } from './cron';

const strongSecret = 'a_very_strong_cron_secret_value_123';

describe('verifyCronAuthorization', () => {
	it('fails closed when secret is missing', () => {
		const result = verifyCronAuthorization(`Bearer ${strongSecret}`, undefined);
		expect(result).toEqual({ authorized: false, reason: 'missing_secret' });
	});

	it('fails closed when secret is blank', () => {
		const result = verifyCronAuthorization('Bearer token', '   ');
		expect(result).toEqual({ authorized: false, reason: 'blank_secret' });
	});

	it('fails closed when secret is too weak', () => {
		const result = verifyCronAuthorization('Bearer token', 'short-secret');
		expect(result).toEqual({ authorized: false, reason: 'weak_secret' });
	});

	it('rejects missing authorization header', () => {
		const result = verifyCronAuthorization(null, strongSecret);
		expect(result).toEqual({ authorized: false, reason: 'missing_header' });
	});

	it('rejects malformed authorization header', () => {
		expect(verifyCronAuthorization('Bearer', strongSecret)).toEqual({
			authorized: false,
			reason: 'malformed_header'
		});
		expect(verifyCronAuthorization('Bearer token extra', strongSecret)).toEqual({
			authorized: false,
			reason: 'malformed_header'
		});
		expect(verifyCronAuthorization('Bearer ', strongSecret)).toEqual({
			authorized: false,
			reason: 'malformed_header'
		});
	});

	it('rejects non-bearer auth schemes', () => {
		const result = verifyCronAuthorization('Basic token', strongSecret);
		expect(result).toEqual({ authorized: false, reason: 'invalid_scheme' });
	});

	it('rejects token mismatch', () => {
		const result = verifyCronAuthorization('Bearer wrong-token', strongSecret);
		expect(result).toEqual({ authorized: false, reason: 'token_mismatch' });
	});

	it('authorizes valid bearer token with strong secret', () => {
		const result = verifyCronAuthorization(`Bearer ${strongSecret}`, strongSecret);
		expect(result).toEqual({ authorized: true });
	});
});

describe('createCronHandler', () => {
	const logger = {
		info: vi.fn<(message: string, meta?: unknown) => void>(),
		warn: vi.fn<(message: string, meta?: unknown) => void>(),
		error: vi.fn<(message: string, meta?: unknown) => void>()
	};

	function call(handler: ReturnType<typeof createCronHandler>, authorization?: string) {
		const headers = authorization ? { authorization } : undefined;
		return handler({
			request: new Request('http://localhost/api/cron/job', { method: 'POST', headers })
		});
	}

	it('returns 401 without running the job when the token is wrong', async () => {
		const run = vi.fn<() => Promise<unknown>>();
		const response = await call(
			createCronHandler({ secret: strongSecret, name: 'job', run, logger }),
			'Bearer nope'
		);
		expect(response.status).toBe(401);
		expect(run).not.toHaveBeenCalled();
	});

	it('runs the job and includes its result', async () => {
		const response = await call(
			createCronHandler({
				secret: strongSecret,
				name: 'job',
				run: async () => ({ sent: 2 }),
				logger
			}),
			`Bearer ${strongSecret}`
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true, result: { sent: 2 } });
	});

	it('omits result for a job that returns nothing', async () => {
		const response = await call(
			createCronHandler({ secret: strongSecret, name: 'job', run: async () => {}, logger }),
			`Bearer ${strongSecret}`
		);
		expect(await response.json()).not.toHaveProperty('result');
	});

	it('returns 500 when the job throws', async () => {
		const response = await call(
			createCronHandler({
				secret: strongSecret,
				name: 'job',
				run: async () => {
					throw new Error('boom');
				},
				logger
			}),
			`Bearer ${strongSecret}`
		);
		expect(response.status).toBe(500);
		expect(logger.error).toHaveBeenCalled();
	});
});
