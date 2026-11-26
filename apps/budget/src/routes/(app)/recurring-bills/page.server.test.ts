import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setAmountMock, loggerMock } = vi.hoisted(() => ({
	setAmountMock: vi.fn<(id: string, month: string, amount: number) => string>(),
	loggerMock: {
		error: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		debug: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({}));
vi.mock('#lib/server/db/index.js', () => ({ getDb: vi.fn<() => void>() }));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));
vi.mock('#lib/server/db/queries/index.js', () => ({ recurringBillQueries: {} }));
vi.mock('#lib/server/db/writes/recurring-bills.js', () => ({
	createRecurringBill: vi.fn<() => void>(),
	deleteRecurringBill: vi.fn<() => void>(),
	markRecurringBillPaid: vi.fn<() => void>(),
	updateRecurringBill: vi.fn<() => void>(),
	setRecurringBillAmountForMonth: setAmountMock
}));

import { actions } from './+page.server';

type FormShape = {
	valid: boolean;
	errors: Record<string, string[] | undefined>;
	message?: App.Superforms.Message;
};
type ActionOutcome = { status?: number; data?: { form: FormShape }; form?: FormShape };

function pastAmountEvent(fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return {
		request: new Request('https://budget.example.com/recurring-bills?/setPastAmount', {
			method: 'POST',
			body
		}),
		locals: { user: { id: 'user-1' } },
		url: new URL('https://budget.example.com/recurring-bills?/setPastAmount')
	} as never;
}

async function setPastAmount(fields: Record<string, string>): Promise<ActionOutcome> {
	return (await actions.setPastAmount(pastAmountEvent(fields))) as ActionOutcome;
}

describe('recurring bills setPastAmount action', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setAmountMock.mockReturnValue('updated');
	});

	it('saves a valid amount for that month', async () => {
		const result = await setPastAmount({ id: 'bill-1', month: '2026-09', amount: '42.50' });

		expect(setAmountMock).toHaveBeenCalledWith('bill-1', '2026-09', 42.5);
		expect(result.status).toBeUndefined();
		expect(result.form?.message).toEqual({
			type: 'success',
			text: 'Amount updated for that month'
		});
	});

	it('rejects a missing bill id with 400 and a field error on id', async () => {
		const result = await setPastAmount({ id: '', month: '2026-09', amount: '10' });

		expect(result.status).toBe(400);
		expect(result.data?.form.errors.id?.[0]).toBe('Recurring bill ID is required');
		expect(setAmountMock).not.toHaveBeenCalled();
	});

	it('answers 500 and logs when the write throws', async () => {
		setAmountMock.mockImplementation(() => {
			throw new Error('database is locked');
		});
		const result = await setPastAmount({ id: 'bill-1', month: '2026-09', amount: '10' });

		expect(result.status).toBe(500);
		expect(result.data?.form.message?.type).toBe('error');
		expect(loggerMock.error).toHaveBeenCalled();
	});

	it('refuses a month that is not in the past with 400', async () => {
		setAmountMock.mockReturnValue('not-past');
		const result = await setPastAmount({ id: 'bill-1', month: '2099-01', amount: '10' });

		expect(result.status).toBe(400);
		expect(result.data?.form.message?.text).toBe('Only past months can be corrected here.');
	});

	it('answers 404 when the bill was not in effect that month', async () => {
		setAmountMock.mockReturnValue('not-found');
		const result = await setPastAmount({ id: 'bill-1', month: '2020-01', amount: '10' });

		expect(result.status).toBe(404);
		expect(result.data?.form.message?.type).toBe('error');
	});

	it.each(['0', '-5'])('rejects amount %s with 400 and a field error on amount', async (amount) => {
		const result = await setPastAmount({ id: 'bill-1', month: '2026-09', amount });

		expect(result.status).toBe(400);
		expect(result.data?.form.errors.amount?.[0]).toBe('Amount must be positive');
		expect(setAmountMock).not.toHaveBeenCalled();
	});

	it('rejects a malformed month with 400 and a field error on month', async () => {
		const result = await setPastAmount({ id: 'bill-1', month: '2026-9', amount: '10' });

		expect(result.status).toBe(400);
		expect(result.data?.form.errors.month?.[0]).toBe('Month must be YYYY-MM');
		expect(setAmountMock).not.toHaveBeenCalled();
	});
});
