import { describe, expect, it } from 'vitest';

import type { RecurringBill, Expense } from '#lib/types.js';
import { getTodayDate } from '#lib/utils/dates.js';

import {
	recurringBillSchema,
	toRecurringBillFormData,
	toDuplicateExpenseFormData,
	toExpenseFormData,
	expenseSchema
} from './finances';

const user: Expense['user'] = {
	id: 'u1',
	name: 'Test User',
	email: 'test@example.com',
	emailVerified: true,
	image: null,
	role: 'user',
	banned: false,
	banReason: null,
	banExpires: null,
	createdAt: new Date('2026-01-01'),
	updatedAt: new Date('2026-01-01')
};

const audit = { createdAt: new Date(0), updatedAt: new Date(0) };

const expense: Expense = {
	id: 't1',
	amount: 42.5,
	payee: 'Costco',
	notes: 'Groceries',
	date: '2026-09-15',
	gstAmount: 2.1,
	excludedFromBudget: true,
	categoryId: 'c1',
	category: { id: 'c1', name: 'Food', description: '', ...audit },
	userId: 'u1',
	...audit,
	user
};

const recurringBill: RecurringBill = {
	id: 'r1',
	merchant: 'Netflix',
	description: 'Streaming',
	cadence: 'Yearly',
	amount: 199,
	paid: false,
	dueDay: 15,
	dueMonth: 3,
	endedAt: null,
	userId: 'u1',
	...audit,
	user
};

describe('toExpenseFormData', () => {
	it('covers every expenseSchema key', () => {
		expect(Object.keys(toExpenseFormData(expense)).sort()).toEqual(
			Object.keys(expenseSchema.shape).sort()
		);
	});

	it('preserves excludedFromBudget and passes validation', () => {
		const data = toExpenseFormData(expense);
		expect(data.excludedFromBudget).toBe(true);
		expect(data.categoryId).toBe('c1');
		expect(expenseSchema.safeParse(data).success).toBe(true);
	});
});

describe('toDuplicateExpenseFormData', () => {
	it('copies the fields but clears the id and dates it today', () => {
		const data = toDuplicateExpenseFormData(expense);
		expect(data).toEqual({
			...toExpenseFormData(expense),
			id: '',
			date: getTodayDate()
		});
		expect(expenseSchema.safeParse(data).success).toBe(true);
	});
});

describe('toRecurringBillFormData', () => {
	it('covers every recurringBillSchema key', () => {
		expect(Object.keys(toRecurringBillFormData(recurringBill)).sort()).toEqual(
			Object.keys(recurringBillSchema.shape).sort()
		);
	});

	it('preserves dueDay/dueMonth and passes validation', () => {
		const data = toRecurringBillFormData(recurringBill);
		expect(data.dueDay).toBe(15);
		expect(data.dueMonth).toBe(3);
		expect(recurringBillSchema.safeParse(data).success).toBe(true);
	});
});
