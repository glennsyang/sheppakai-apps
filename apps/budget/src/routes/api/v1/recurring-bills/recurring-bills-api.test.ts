// `/api/v1/recurring-bills` replaced `/api/v1/recurring` (#320). The old paths stay as aliases
// for one release, so both must answer the same way.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireApiKey = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockFindActive = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockMarkPaid = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockRecordApiWrite = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

vi.mock('#lib/server/api/require-api-key.js', () => ({ requireApiKey: mockRequireApiKey }));
vi.mock('#lib/server/db/queries/index.js', () => ({
	recurringBillQueries: { findActive: mockFindActive }
}));
vi.mock('#lib/server/db/writes/recurring-bills.js', () => ({
	markRecurringBillPaid: mockMarkPaid
}));
vi.mock('#lib/server/api/audit-log', () => ({ recordApiWrite: mockRecordApiWrite }));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		debug: vi.fn<(...args: unknown[]) => void>()
	}
}));

import { GET as aliasGet } from '../recurring/+server';
import { PATCH as aliasPatch } from '../recurring/[id]/+server';
import { GET } from './+server';
import { PATCH } from './[id]/+server';

const bill = { id: 'rb1', merchant: 'Rogers', amount: 47.8, cadence: 'Monthly', paid: false };

type Handler = (event: never) => Promise<Response> | Response;

function call(handler: Handler, path: string, init?: RequestInit, params = {}) {
	const url = new URL(`https://budget.example.com${path}`);
	const request = new Request(url, init);
	return handler({ request, url, params } as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockRequireApiKey.mockResolvedValue({ ok: true, apiKeyId: 'key1', userId: 'user1' });
});

describe('GET /api/v1/recurring-bills', () => {
	it.each([
		['/api/v1/recurring-bills', GET],
		['/api/v1/recurring', aliasGet]
	])('%s lists active recurring bills', async (path, handler) => {
		mockFindActive.mockResolvedValue([bill]);

		const response = await call(handler, path);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: [bill] });
		expect(mockRequireApiKey).toHaveBeenCalledWith(expect.any(Request), 'recurring:read');
	});

	it('returns the same body from both paths', async () => {
		mockFindActive.mockResolvedValue([bill]);

		const [current, alias] = await Promise.all([
			call(GET as Handler, '/api/v1/recurring-bills'),
			call(aliasGet as Handler, '/api/v1/recurring')
		]);

		expect(await alias.json()).toEqual(await current.json());
	});
});

describe('PATCH /api/v1/recurring-bills/[id]', () => {
	it.each([
		['/api/v1/recurring-bills/rb1', PATCH],
		['/api/v1/recurring/rb1', aliasPatch]
	])('%s marks a recurring bill paid', async (path, handler) => {
		mockMarkPaid.mockResolvedValue({ ...bill, paid: true });

		const response = await call(
			handler,
			path,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ paid: true })
			},
			{ id: 'rb1' }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { ...bill, paid: true } });
		expect(mockMarkPaid).toHaveBeenCalledWith('rb1', true);
		expect(mockRequireApiKey).toHaveBeenCalledWith(expect.any(Request), 'recurring:markPaid');
	});
});
