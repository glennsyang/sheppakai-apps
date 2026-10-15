import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { checkMock, loggerMock } = vi.hoisted(() => ({
	checkMock: vi.fn<() => Promise<{ limited: boolean; retryAfter: number }>>(),
	loggerMock: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

vi.mock('#lib/server/rate-limiter.js', () => ({
	createUserRateLimiter: () => ({ check: checkMock })
}));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

import { createAiEndpoint } from '#lib/server/ai/endpoint.js';

const run = vi.fn<(input: { meal: string }) => Promise<string[]>>();
const POST = createAiEndpoint({
	schema: z.object({ meal: z.string().min(1, 'Meal is required') }),
	run,
	label: 'Test API',
	failMessage: 'Failed to generate'
});

function call(body: string, user: unknown = { id: 'user-1' }) {
	return POST({
		request: new Request('http://localhost/api/test', { method: 'POST', body }),
		locals: { user }
	} as never) as Promise<Response>;
}

beforeEach(() => {
	vi.clearAllMocks();
	checkMock.mockResolvedValue({ limited: false, retryAfter: 0 });
});

describe('createAiEndpoint', () => {
	it('returns 401 unauthorized without a user', async () => {
		const res = await call('{}', null);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: { code: 'unauthorized', message: 'Sign in to use this feature.' }
		});
		expect(checkMock).not.toHaveBeenCalled();
	});

	it('returns 429 rate_limited with a Retry-After header', async () => {
		checkMock.mockResolvedValueOnce({ limited: true, retryAfter: 42 });

		const res = await call(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('42');
		expect((await res.json()).error.code).toBe('rate_limited');
		expect(run).not.toHaveBeenCalled();
	});

	it('returns 400 invalid_json for a malformed body', async () => {
		const res = await call('not json');

		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_json');
	});

	it('returns 400 validation_failed for a body that fails the schema', async () => {
		const res = await call(JSON.stringify({ meal: '' }));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: { code: 'validation_failed', message: 'Meal is required' }
		});
	});

	it('returns the result as { data }', async () => {
		run.mockResolvedValueOnce(['Fish tacos']);

		const res = await call(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: ['Fish tacos'] });
		expect(run).toHaveBeenCalledWith({ meal: 'Tacos' });
	});

	it('returns 500 internal_error and logs when the AI call fails', async () => {
		run.mockRejectedValueOnce(new Error('model down'));

		const res = await call(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({
			error: { code: 'internal_error', message: 'Failed to generate' }
		});
		expect(loggerMock.error).toHaveBeenCalledWith('Test API error', expect.any(Error));
	});
});
