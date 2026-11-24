import { beforeEach, describe, expect, it, vi } from 'vitest';

type InsertedRow = {
	id: string;
	name: string;
	description: string;
	date: string;
	amount: number;
	userId: string;
};
type FoundIncome = { id: string; amount: number; user: object };

const mockInsertReturning = vi.hoisted(() =>
	vi.fn<() => Promise<InsertedRow[]>>(async () => [
		{
			id: 'income-1',
			name: 'Freelance payment',
			description: 'Invoice #42',
			date: '2026-08-12 00:00:00',
			amount: 500,
			userId: 'user-1'
		}
	])
);
const mockInsertValues = vi.hoisted(() =>
	vi.fn<(values: Record<string, unknown>) => { returning: typeof mockInsertReturning }>(
		(values) => {
			void values;
			return { returning: mockInsertReturning };
		}
	)
);
const mockInsert = vi.hoisted(() =>
	vi.fn<() => { values: typeof mockInsertValues }>(() => ({ values: mockInsertValues }))
);
const mockFindById = vi.hoisted(() =>
	vi.fn<(id: string) => Promise<FoundIncome | undefined>>(async (id) => ({
		id,
		amount: 500,
		user: {}
	}))
);

const mockUpdateWhere = vi.hoisted(() => vi.fn<(where: unknown) => Promise<void>>(async () => {}));
const mockUpdateSet = vi.hoisted(() =>
	vi.fn<(values: Record<string, unknown>) => { where: typeof mockUpdateWhere }>(() => ({
		where: mockUpdateWhere
	}))
);
const mockDeleteWhere = vi.hoisted(() => vi.fn<(where: unknown) => Promise<void>>(async () => {}));

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({
		insert: mockInsert,
		update: () => ({ set: mockUpdateSet }),
		delete: () => ({ where: mockDeleteWhere })
	})
}));
vi.mock('drizzle-orm', () => ({ eq: (field: unknown, value: unknown) => ({ field, value }) }));
vi.mock('#lib/server/db/queries/index.js', () => ({ incomeQueries: { findById: mockFindById } }));
vi.mock('#lib/server/db/schema/index.js', () => ({ income: { id: 'income.id' } }));

import { createIncome, deleteIncome, updateIncome } from './income';

describe('createIncome', () => {
	beforeEach(() => {
		mockInsert.mockClear();
		mockInsertValues.mockClear();
		mockInsertReturning.mockClear();
		mockFindById.mockClear();
	});

	it('inserts without createdBy/updatedBy', async () => {
		await createIncome(
			{ name: 'Freelance payment', description: 'Invoice #42', date: '2026-08-12', amount: 500 },
			'user-1'
		);

		const insertedValues = mockInsertValues.mock.calls[0][0];
		expect(insertedValues.userId).toBe('user-1');
		expect(insertedValues).not.toHaveProperty('createdBy');
		expect(insertedValues).not.toHaveProperty('updatedBy');
		expect(String(insertedValues.date)).toMatch(/^2026-08-12 \d{2}:\d{2}:\d{2}$/);
	});

	it('re-fetches the created record with relations', async () => {
		const result = await createIncome(
			{ name: 'Freelance payment', description: 'Invoice #42', date: '2026-08-12', amount: 500 },
			'user-1'
		);

		expect(mockFindById).toHaveBeenCalledWith('income-1');
		expect(result).toEqual({ id: 'income-1', amount: 500, user: {} });
	});

	it('throws if the record cannot be re-fetched after insert', async () => {
		mockFindById.mockResolvedValueOnce(undefined);

		await expect(
			createIncome(
				{ name: 'Freelance payment', description: 'Invoice #42', date: '2026-08-12', amount: 500 },
				'user-1'
			)
		).rejects.toThrow('Failed to re-fetch income income-1 after creation');
	});
});

describe('updateIncome', () => {
	it('formats the date for storage and stamps updatedAt', async () => {
		await updateIncome('inc-1', {
			name: 'Pay',
			description: 'June',
			date: '2026-06-15',
			amount: 3000
		});

		const row = mockUpdateSet.mock.calls[0][0];
		expect(row).toMatchObject({ name: 'Pay', description: 'June', amount: 3000 });
		expect(String(row.date)).toMatch(/^2026-06-15/);
		expect(row.updatedAt).toBeInstanceOf(Date);
		expect(row).not.toHaveProperty('userId');
		expect(mockUpdateWhere).toHaveBeenCalledWith({ field: 'income.id', value: 'inc-1' });
	});
});

describe('deleteIncome', () => {
	it('deletes the row by id', async () => {
		await deleteIncome('inc-2');
		expect(mockDeleteWhere).toHaveBeenCalledWith({ field: 'income.id', value: 'inc-2' });
	});
});
