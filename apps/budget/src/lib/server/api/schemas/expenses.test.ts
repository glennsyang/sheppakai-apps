import { describe, expect, it } from 'vitest';

import { apiCreateExpenseSchema, apiExpenseListQuerySchema } from './expenses';

describe('apiCreateExpenseSchema', () => {
	const valid = {
		amount: 42.5,
		payee: 'Grocery Store',
		notes: 'Weekly shop',
		date: '2026-08-12',
		categoryId: 'cat-1'
	};

	it('accepts a valid body', () => {
		expect(apiCreateExpenseSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects a non-positive amount', () => {
		expect(apiCreateExpenseSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
	});

	it('rejects a malformed date', () => {
		expect(apiCreateExpenseSchema.safeParse({ ...valid, date: '08/12/2026' }).success).toBe(false);
	});

	it('rejects an id field (server-generated)', () => {
		const result = apiCreateExpenseSchema.safeParse({ ...valid, id: 'client-supplied' });
		expect(result.success && !('id' in result.data)).toBe(true);
	});

	it('rejects a missing category', () => {
		expect(apiCreateExpenseSchema.safeParse({ ...valid, categoryId: '' }).success).toBe(false);
	});
});

describe('apiExpenseListQuerySchema', () => {
	it('accepts no filters', () => {
		expect(apiExpenseListQuerySchema.safeParse({}).success).toBe(true);
	});

	it('accepts a full date range', () => {
		expect(
			apiExpenseListQuerySchema.safeParse({ startDate: '2026-08-01', endDate: '2026-08-31' })
				.success
		).toBe(true);
	});

	it('rejects a one-sided date range', () => {
		expect(apiExpenseListQuerySchema.safeParse({ startDate: '2026-08-01' }).success).toBe(false);
	});

	it('rejects a malformed date', () => {
		expect(
			apiExpenseListQuerySchema.safeParse({ startDate: '08-01-2026', endDate: '2026-08-31' })
				.success
		).toBe(false);
	});
});
