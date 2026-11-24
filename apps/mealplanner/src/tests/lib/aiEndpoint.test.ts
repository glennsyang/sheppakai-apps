import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { checkMock, loggerMock, requireApiKeyMock, recordApiWriteMock } = vi.hoisted(() => ({
	checkMock:
		vi.fn<
			(event: unknown, key: { userId: string }) => Promise<{ limited: boolean; retryAfter: number }>
		>(),
	requireApiKeyMock: vi.fn<(request: Request, scope: string) => Promise<unknown>>(),
	recordApiWriteMock: vi.fn<(entry: unknown) => Promise<void>>(),
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
vi.mock('#lib/server/api/require-api-key.js', () => ({ requireApiKey: requireApiKeyMock }));
vi.mock('#lib/server/api/audit-log.js', () => ({ recordApiWrite: recordApiWriteMock }));

import { apiKeyCaller, createAiEndpoint, sessionCaller } from '#lib/server/ai/endpoint.js';

const run = vi.fn<(input: { meal: string }) => Promise<string[]>>();
const options = {
	schema: z.object({ meal: z.string().min(1, 'Meal is required') }),
	run,
	label: 'Test API',
	failMessage: 'Failed to generate'
};
const POST = createAiEndpoint({ caller: sessionCaller, ...options });
const API_POST = createAiEndpoint({ caller: apiKeyCaller('suggest:write'), ...options });

function call(body: string, user: unknown = { id: 'user-1' }) {
	return POST({
		request: new Request('http://localhost/api/test', { method: 'POST', body }),
		locals: { user }
	} as never) as Promise<Response>;
}

function callWithKey(body: string) {
	const url = new URL('http://localhost/api/v1/test');
	return API_POST({
		request: new Request(url, { method: 'POST', body, headers: { authorization: 'Bearer sk' } }),
		url,
		locals: { user: null }
	} as never) as Promise<Response>;
}

beforeEach(() => {
	vi.clearAllMocks();
	checkMock.mockResolvedValue({ limited: false, retryAfter: 0 });
	requireApiKeyMock.mockResolvedValue({ ok: true, apiKeyId: 'key-1', userId: 'user-1' });
	recordApiWriteMock.mockResolvedValue();
});

describe('createAiEndpoint with sessionCaller', () => {
	it('returns 401 unauthorized without a user', async () => {
		const res = await call('{}', null);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: { code: 'unauthorized', message: 'Sign in to use this feature.' }
		});
		expect(checkMock).not.toHaveBeenCalled();
	});

	it('rate-limits by user id', async () => {
		run.mockResolvedValueOnce([]);
		await call(JSON.stringify({ meal: 'Tacos' }));
		expect(checkMock).toHaveBeenCalledWith(expect.anything(), { userId: 'user-1' });
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

describe('createAiEndpoint with apiKeyCaller', () => {
	it('passes a failed key check through without rate limiting or auditing', async () => {
		requireApiKeyMock.mockResolvedValueOnce({
			ok: false,
			status: 401,
			code: 'invalid_api_key',
			message: 'Invalid API key.'
		});

		const res = await callWithKey(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('invalid_api_key');
		expect(requireApiKeyMock).toHaveBeenCalledWith(expect.any(Request), 'suggest:write');
		expect(checkMock).not.toHaveBeenCalled();
		expect(recordApiWriteMock).not.toHaveBeenCalled();
	});

	it('rate-limits by key with the shared 429 wording', async () => {
		checkMock.mockResolvedValueOnce({ limited: true, retryAfter: 30 });

		const res = await callWithKey(JSON.stringify({ meal: 'Tacos' }));

		expect(checkMock).toHaveBeenCalledWith(expect.anything(), { userId: 'apikey:key-1' });
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('30');
		expect(await res.json()).toEqual({
			error: { code: 'rate_limited', message: 'Too many requests. Please try again in 30 seconds.' }
		});
		expect(run).not.toHaveBeenCalled();
	});

	it('returns { data } with 200 and audits the call', async () => {
		run.mockResolvedValueOnce(['Fish tacos']);

		const res = await callWithKey(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: ['Fish tacos'] });
		expect(recordApiWriteMock).toHaveBeenCalledWith({
			apiKeyId: 'key-1',
			userId: 'user-1',
			method: 'POST',
			path: '/api/v1/test',
			action: 'suggest:write',
			statusCode: 200
		});
	});

	it('audits a failed call as 500', async () => {
		run.mockRejectedValueOnce(new Error('model down'));

		const res = await callWithKey(JSON.stringify({ meal: 'Tacos' }));

		expect(res.status).toBe(500);
		expect((await res.json()).error).toEqual({
			code: 'internal_error',
			message: 'Failed to generate.'
		});
		expect(recordApiWriteMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
	});
});
