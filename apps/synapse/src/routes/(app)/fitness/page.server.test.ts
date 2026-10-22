import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInsertValues, mockOnConflictDoUpdate } = vi.hoisted(() => {
	const onConflictDoUpdate = vi.fn<(config: unknown) => Promise<void>>(async () => undefined);
	return {
		mockOnConflictDoUpdate: onConflictDoUpdate,
		mockInsertValues: vi.fn<(values: unknown) => unknown>(() => ({ onConflictDoUpdate }))
	};
});

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		insert: () => ({ values: mockInsertValues })
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

	it('upserts the target in a single statement and returns the form', async () => {
		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '2200' }),
			locals: { user: USER }
		} as never);

		expect(mockInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER.id, targetCalories: 2200 })
		);
		expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ set: expect.objectContaining({ targetCalories: 2200 }) })
		);
		expect(result).toMatchObject({
			success: true,
			form: { valid: true, data: { targetCalories: 2200 } }
		});
	});

	it('returns a 500 message when the upsert fails', async () => {
		mockOnConflictDoUpdate.mockRejectedValueOnce(new Error('db down'));

		const result = await actions.setCalorieTarget({
			request: post({ targetCalories: '1800' }),
			locals: { user: USER }
		} as never);

		expect(result).toMatchObject({ status: 500, data: { form: { message: { type: 'error' } } } });
	});
});
