import { beforeEach, describe, expect, it, vi } from 'vitest';

type InsertedRow = {
	id: string;
	amount: number;
	payee: string;
	notes: string;
	date: string;
	gstAmount: undefined;
	excludedFromBudget: boolean;
	categoryId: string;
	userId: string;
};
type FoundExpense = { id: string; amount: number; category: null; user: object };

const mockInsertReturning = vi.hoisted(() =>
	vi.fn<() => Promise<InsertedRow[]>>(async () => [
		{
			id: 'txn-1',
			amount: 42.5,
			payee: 'Grocery Store',
			notes: 'Weekly shop',
			date: '2020-06-15 00:00:00',
			gstAmount: undefined,
			excludedFromBudget: false,
			categoryId: 'cat-1',
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
	vi.fn<(id: string) => Promise<FoundExpense | undefined>>(async (id) => ({
		id,
		amount: 42.5,
		category: null,
		user: {}
	}))
);
const mockEvaluateBudgetAlert = vi.hoisted(() =>
	vi.fn<(row: InsertedRow) => Promise<void>>(async () => undefined)
);
const previousExpense = {
	id: 'txn-1',
	userId: 'user-1',
	categoryId: 'cat-1',
	amount: 10,
	date: '2020-06-01 00:00:00',
	excludedFromBudget: false
};
const mockBuildUpdateContext = vi.hoisted(() =>
	vi.fn<(id: string) => Promise<{ previousExpense: object | null }>>()
);
const mockEvaluateUpdatedAlert = vi.hoisted(() =>
	vi.fn<(row: Record<string, unknown>, context: unknown) => Promise<void>>(async () => undefined)
);
const mockUpdateWhere = vi.hoisted(() => vi.fn<(where: unknown) => Promise<void>>(async () => {}));
const mockUpdateSet = vi.hoisted(() =>
	vi.fn<(values: Record<string, unknown>) => { where: typeof mockUpdateWhere }>(() => ({
		where: mockUpdateWhere
	}))
);
const mockUpdate = vi.hoisted(() =>
	vi.fn<() => { set: typeof mockUpdateSet }>(() => ({ set: mockUpdateSet }))
);
const mockDeleteWhere = vi.hoisted(() => vi.fn<(where: unknown) => Promise<void>>(async () => {}));
const mockDelete = vi.hoisted(() =>
	vi.fn<() => { where: typeof mockDeleteWhere }>(() => ({ where: mockDeleteWhere }))
);

vi.mock('#lib/server/db/index.js', () => ({
	getDb: () => ({ insert: mockInsert, update: mockUpdate, delete: mockDelete })
}));
vi.mock('#lib/server/db/queries/index.js', () => ({
	expenseQueries: { findById: mockFindById }
}));
vi.mock('#lib/server/db/schema/index.js', () => ({ expense: { id: 'expense.id' } }));
vi.mock('drizzle-orm', () => ({ eq: (field: unknown, value: unknown) => ({ field, value }) }));
vi.mock('#lib/server/notifications/budget-threshold-alerts.js', () => ({
	evaluateCreatedExpenseBudgetAlert: mockEvaluateBudgetAlert,
	buildExpenseBudgetAlertUpdateContext: mockBuildUpdateContext,
	evaluateUpdatedExpenseBudgetAlert: mockEvaluateUpdatedAlert
}));

import { createExpense, deleteExpense, updateExpense } from './expenses';

describe('createExpense', () => {
	beforeEach(() => {
		mockInsert.mockClear();
		mockInsertValues.mockClear();
		mockInsertReturning.mockClear();
		mockFindById.mockClear();
		mockEvaluateBudgetAlert.mockClear();
	});

	it('inserts without createdBy/updatedBy', async () => {
		await createExpense(
			{
				amount: 42.5,
				payee: 'Grocery Store',
				notes: 'Weekly shop',
				date: '2020-06-15',
				excludedFromBudget: false,
				categoryId: 'cat-1'
			},
			'user-1'
		);

		const insertedValues = mockInsertValues.mock.calls[0][0];
		expect(insertedValues.userId).toBe('user-1');
		expect(insertedValues).not.toHaveProperty('createdBy');
		expect(insertedValues).not.toHaveProperty('updatedBy');
		expect(insertedValues.categoryId).toBe('cat-1');
		expect(String(insertedValues.date)).toMatch(/^2020-06-15 \d{2}:\d{2}:\d{2}$/);
	});

	it('evaluates budget alerts for the inserted row', async () => {
		await createExpense(
			{
				amount: 42.5,
				payee: 'Grocery Store',
				notes: 'Weekly shop',
				date: '2020-06-15',
				excludedFromBudget: false,
				categoryId: 'cat-1'
			},
			'user-1'
		);

		expect(mockEvaluateBudgetAlert).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'txn-1', categoryId: 'cat-1' })
		);
	});

	it('re-fetches the created record with relations', async () => {
		const result = await createExpense(
			{
				amount: 42.5,
				payee: 'Grocery Store',
				notes: 'Weekly shop',
				date: '2020-06-15',
				excludedFromBudget: false,
				categoryId: 'cat-1'
			},
			'user-1'
		);

		expect(mockFindById).toHaveBeenCalledWith('txn-1');
		expect(result).toEqual({ id: 'txn-1', amount: 42.5, category: null, user: {} });
	});

	it('throws if the record cannot be re-fetched after insert', async () => {
		mockFindById.mockResolvedValueOnce(undefined);

		await expect(
			createExpense(
				{
					amount: 42.5,
					payee: 'Grocery Store',
					notes: 'Weekly shop',
					date: '2020-06-15',
					excludedFromBudget: false,
					categoryId: 'cat-1'
				},
				'user-1'
			)
		).rejects.toThrow('Failed to re-fetch expense txn-1 after creation');
	});
});

describe('updateExpense', () => {
	const base = {
		amount: 10,
		payee: 'Shop',
		notes: 'n',
		date: '2020-06-15',
		excludedFromBudget: true,
		categoryId: 'cat-1'
	};

	beforeEach(() => {
		mockUpdateSet.mockClear();
		mockUpdateWhere.mockClear();
		mockEvaluateUpdatedAlert.mockClear();
		mockBuildUpdateContext.mockReset().mockResolvedValue({ previousExpense });
	});

	function setValues() {
		return mockUpdateSet.mock.calls[0][0];
	}

	it('maps a missing gstAmount to null so an update can clear it', async () => {
		await updateExpense('txn-1', base);
		expect(setValues().gstAmount).toBeNull();
	});

	it('formats the date for storage, stamps updatedAt and leaves the owner alone', async () => {
		await updateExpense('txn-1', { ...base, gstAmount: 0.5 });

		const row = setValues();
		expect(row.excludedFromBudget).toBe(true);
		expect(row.gstAmount).toBe(0.5);
		expect(String(row.date)).toMatch(/^2020-06-15/);
		expect(row.updatedAt).toBeInstanceOf(Date);
		expect(row).not.toHaveProperty('userId');
		expect(mockUpdateWhere).toHaveBeenCalledWith({ field: 'expense.id', value: 'txn-1' });
	});

	it('reads the Expense before the update and evaluates the Budget alert against it', async () => {
		await updateExpense('txn-1', { ...base, amount: 99 });

		expect(mockBuildUpdateContext).toHaveBeenCalledWith('txn-1');
		expect(mockBuildUpdateContext.mock.invocationCallOrder[0]).toBeLessThan(
			mockUpdateSet.mock.invocationCallOrder[0]
		);
		expect(mockEvaluateUpdatedAlert).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 99, categoryId: 'cat-1' }),
			{ previousExpense }
		);
	});
});

describe('deleteExpense', () => {
	it('deletes the row by id', async () => {
		await deleteExpense('txn-7');
		expect(mockDelete).toHaveBeenCalled();
		expect(mockDeleteWhere).toHaveBeenCalledWith({ field: 'expense.id', value: 'txn-7' });
	});
});
