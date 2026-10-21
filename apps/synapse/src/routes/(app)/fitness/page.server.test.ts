import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCalorieFindFirst, mockInsertValues, mockUpdateWhere } = vi.hoisted(() => ({
	mockCalorieFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(async () => undefined),
	mockInsertValues: vi.fn<(values: unknown) => Promise<void>>(async () => undefined),
	mockUpdateWhere: vi.fn<(where: unknown) => Promise<void>>(async () => undefined)
}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		query: { dailyCalorieTargets: { findFirst: mockCalorieFindFirst } },
		insert: () => ({ values: mockInsertValues }),
		update: () => ({ set: () => ({ where: mockUpdateWhere }) })
	})
}));
vi.mock('#lib/server/logger.js', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));
vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: '' }));

const { actions } = await import('./+page.server');

const USER = { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'user' };

function post(fields: Record<string, string>) {
	return new Request('https://synapse.example.com/fitness?/setCalorieTarget', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

describe('fitness setCalorieTarget action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the form on success when inserting a new target', async () => {
		mockCalorieFindFirst.mockResolvedValueOnce(undefined);

		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '2200' }),
			locals: { user: USER }
		} as never);

		expect(mockInsertValues).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			success: true,
			form: { valid: true, data: { targetCalories: 2200 } }
		});
	});

	it('returns the form on success when replacing an existing target', async () => {
		mockCalorieFindFirst.mockResolvedValueOnce({ id: 'target-1', userId: USER.id });

		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '1800' }),
			locals: { user: USER }
		} as never);

		expect(mockUpdateWhere).toHaveBeenCalledOnce();
		expect(mockInsertValues).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			success: true,
			form: { valid: true, data: { targetCalories: 1800 } }
		});
	});
});
