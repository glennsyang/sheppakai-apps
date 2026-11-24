import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireApiKey = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockFindAll = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockCreate = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const mockRecordApiWrite = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

vi.mock('#lib/server/api/require-api-key.js', () => ({ requireApiKey: mockRequireApiKey }));
vi.mock('#lib/server/db/queries/index.js', () => ({
	expenseQueries: { findAll: mockFindAll }
}));
vi.mock('#lib/server/db/writes/expenses.js', () => ({ createExpense: mockCreate }));
vi.mock('#lib/server/api/audit-log', () => ({ recordApiWrite: mockRecordApiWrite }));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		warn: vi.fn<(...args: unknown[]) => void>(),
		error: vi.fn<(...args: unknown[]) => void>(),
		info: vi.fn<(...args: unknown[]) => void>(),
		debug: vi.fn<(...args: unknown[]) => void>()
	}
}));

import { GET, POST } from './+server';

const expense = { id: 'tx1', amount: 42.5, payee: 'Grocery Store', date: '2026-08-12' };
const owner = {
	id: 'user1',
	name: 'Glenn',
	email: 'someone@example.com',
	role: 'admin',
	banned: false
};
const body = {
	amount: 42.5,
	payee: 'Grocery Store',
	notes: 'Weekly shop',
	date: '2026-08-12',
	categoryId: 'cat_123',
	excludedFromBudget: false
};

type Handler = (event: never) => Promise<Response> | Response;

function call(handler: Handler, path: string, init?: RequestInit) {
	const url = new URL(`https://budget.example.com${path}`);
	const request = new Request(url, init);
	return handler({ request, url, params: {} } as never);
}

function post(handler: Handler, path: string) {
	return call(handler, path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockRequireApiKey.mockResolvedValue({ ok: true, apiKeyId: 'key1', userId: 'user1' });
});

describe('GET /api/v1/expenses', () => {
	it('lists expenses', async () => {
		mockFindAll.mockResolvedValue([expense]);

		const response = await call(GET, '/api/v1/expenses');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: [expense] });
		expect(mockRequireApiKey).toHaveBeenCalledWith(expect.any(Request), 'transactions:read');
		expect(mockFindAll).toHaveBeenCalledWith({ limit: 50 });
	});

	it('returns only the owner’s id and name, never their email or role', async () => {
		mockFindAll.mockResolvedValue([{ ...expense, user: owner }]);

		const response = await call(GET, '/api/v1/expenses');

		expect(await response.json()).toEqual({
			data: [{ ...expense, user: { id: 'user1', name: 'Glenn' } }]
		});
	});
});

describe('POST /api/v1/expenses', () => {
	it('creates an expense', async () => {
		mockCreate.mockResolvedValue(expense);

		const response = await post(POST, '/api/v1/expenses');

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ data: expense });
		expect(mockRequireApiKey).toHaveBeenCalledWith(expect.any(Request), 'transactions:write');
		expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining(body), 'user1');
		expect(mockRecordApiWrite).toHaveBeenCalledWith(
			expect.objectContaining({ path: '/api/v1/expenses' })
		);
	});

	it('returns only the owner’s id and name for the created expense', async () => {
		mockCreate.mockResolvedValue({ ...expense, user: owner });

		const response = await post(POST, '/api/v1/expenses');

		expect(await response.json()).toEqual({
			data: { ...expense, user: { id: 'user1', name: 'Glenn' } }
		});
	});

	it('rejects an invalid body', async () => {
		const response = await call(POST, '/api/v1/expenses', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...body, amount: -1 })
		});

		expect(response.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
	});
});
