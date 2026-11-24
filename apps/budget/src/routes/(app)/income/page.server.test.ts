import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findByDateRangeMock, loggerMock } = vi.hoisted(() => ({
	findByDateRangeMock: vi.fn<() => Promise<unknown[]>>(),
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
vi.mock('#lib/server/db/queries/index.js', () => ({
	incomeQueries: { findByDateRange: findByDateRangeMock }
}));

import { load } from './+page.server';

const URL_ = new URL('https://budget.example.com/income?month=3&year=2026');

async function runLoad() {
	return (await load({
		url: URL_,
		request: new Request(URL_),
		route: { id: null }
	} as never)) as Record<string, unknown>;
}

const income = (date: string, amount: number) => ({ id: date, date, amount });

describe('income load monthly average', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		// Mid-March 2026 Pacific: January and February are the completed months.
		vi.setSystemTime(new Date('2026-03-15T20:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores the current month's and future-dated Income", async () => {
		findByDateRangeMock.mockResolvedValue([
			income('2026-01-15', 4000),
			income('2026-02-15', 2000),
			income('2026-03-01', 9000), // current month
			income('2026-12-15', 7000) // future-dated
		]);

		const result = await runLoad();

		expect(result.monthlyAverage).toBe(3000);
		expect(result.monthlyIncomes).toEqual([income('2026-03-01', 9000)]);
		expect(result).not.toHaveProperty('completedMonthsSinceJanuary');
	});

	it('is null when there is no Income', async () => {
		findByDateRangeMock.mockResolvedValue([]);
		expect((await runLoad()).monthlyAverage).toBeNull();
	});

	it('is null with a loadError when the query fails', async () => {
		findByDateRangeMock.mockRejectedValue(new Error('db down'));

		const result = await runLoad();

		expect(result.monthlyAverage).toBeNull();
		expect(result.loadError).toEqual(expect.any(String));
		expect(loggerMock.error).toHaveBeenCalledOnce();
	});
});
