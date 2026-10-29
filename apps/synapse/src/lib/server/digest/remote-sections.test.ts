import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	BUDGET_API_URL: 'https://budget.example.com' as string | undefined,
	BUDGET_API_KEY: 'budget-key' as string | undefined,
	MEALPLANNER_API_URL: 'https://meals.example.com' as string | undefined,
	MEALPLANNER_API_KEY: 'meals-key' as string | undefined
}));

vi.mock('$app/env/private', () => ({
	get BUDGET_API_URL() {
		return env.BUDGET_API_URL;
	},
	get BUDGET_API_KEY() {
		return env.BUDGET_API_KEY;
	},
	get MEALPLANNER_API_URL() {
		return env.MEALPLANNER_API_URL;
	},
	get MEALPLANNER_API_KEY() {
		return env.MEALPLANNER_API_KEY;
	}
}));

vi.mock('#lib/server/logger.js', () => ({
	logger: { debug: vi.fn<() => void>(), warn: vi.fn<() => void>(), error: vi.fn<() => void>() }
}));

import { fetchBillsDueThisWeek, fetchTonightsDinner } from './remote-sections';

const TODAY = '2026-10-28';
const fetchMock = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>();

function planWeek(recipeName: string | null) {
	return {
		data: {
			weekStartDate: '2026-10-26',
			days: [
				{ dayOfWeek: 0, day: 'Monday', date: '2026-10-26', entryId: null, recipe: null },
				{
					dayOfWeek: 2,
					day: 'Wednesday',
					date: TODAY,
					entryId: recipeName ? 'entry-1' : null,
					recipe: recipeName ? { id: 'r1', name: recipeName, description: 'x' } : null
				}
			]
		}
	};
}

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
	env.BUDGET_API_URL = 'https://budget.example.com';
	env.BUDGET_API_KEY = 'budget-key';
	env.MEALPLANNER_API_URL = 'https://meals.example.com';
	env.MEALPLANNER_API_KEY = 'meals-key';
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchTonightsDinner', () => {
	it("returns today's recipe name, asking mealplanner for the week containing today", async () => {
		fetchMock.mockResolvedValue(Response.json(planWeek('Chicken tikka masala')));

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: true, value: 'Chicken tikka masala' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url.href).toBe(`https://meals.example.com/api/v1/plans?week=${TODAY}`);
		expect(init?.headers).toMatchObject({ Authorization: 'Bearer meals-key' });
	});

	it('returns null when nothing is planned tonight', async () => {
		fetchMock.mockResolvedValue(Response.json(planWeek(null)));

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: true, value: null });
	});

	it('skips the section without fetching when mealplanner is not configured', async () => {
		env.MEALPLANNER_API_KEY = undefined;

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: false });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('skips the section on a non-2xx response', async () => {
		fetchMock.mockResolvedValue(
			Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
		);

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: false });
	});

	it('skips the section when mealplanner is unreachable', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: false });
	});

	it('skips the section on an unexpected response shape', async () => {
		fetchMock.mockResolvedValue(Response.json({ data: { days: 'nope' } }));

		expect(await fetchTonightsDinner(TODAY)).toEqual({ ok: false });
	});
});

describe('fetchBillsDueThisWeek', () => {
	it("returns this week's unpaid bills from budget's recurring list", async () => {
		fetchMock.mockResolvedValue(
			Response.json({
				data: [
					{
						id: 'b1',
						merchant: 'Hydro',
						description: 'Electricity',
						cadence: 'Monthly',
						amount: 120,
						paid: false,
						dueDay: 30,
						dueMonth: null
					},
					{
						id: 'b2',
						merchant: 'Rent',
						description: 'Rent',
						cadence: 'Monthly',
						amount: 2000,
						paid: true,
						dueDay: 30,
						dueMonth: null
					}
				]
			})
		);

		expect(await fetchBillsDueThisWeek(TODAY)).toEqual({
			ok: true,
			value: [{ merchant: 'Hydro', amount: 120, dueDate: '2026-10-30' }]
		});
		const [url, init] = fetchMock.mock.calls[0];
		expect(url.href).toBe('https://budget.example.com/api/v1/recurring');
		expect(init?.headers).toMatchObject({ Authorization: 'Bearer budget-key' });
	});

	it('skips the section when budget is unreachable', async () => {
		fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

		expect(await fetchBillsDueThisWeek(TODAY)).toEqual({ ok: false });
	});
});
