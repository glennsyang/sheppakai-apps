import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
	const dbError = new Error('database is locked');
	const reject = () => vi.fn<() => Promise<never>>(async () => Promise.reject(dbError));
	return {
		dbError,
		pantryMock: { listPantryItems: reject() },
		mealPlanMock: {
			getMealPlanWithEntries: reject(),
			getMondayOfCurrentWeek: vi.fn<() => string>().mockReturnValue('2026-09-28')
		},
		loggerError: vi.fn<() => void>()
	};
});

vi.mock('$lib/server/services/pantry', () => mockState.pantryMock);
vi.mock('$lib/server/services/mealPlan', () => mockState.mealPlanMock);
vi.mock('$lib/server/services/recipes', () => ({}));
vi.mock('$lib/server/logger', () => ({
	logger: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: mockState.loggerError
	}
}));

import { load as homeLoad } from '../../routes/(app)/+page.server';
import { load as pantryLoad } from '../../routes/(app)/pantry/+page.server';
import { load as plannerLoad } from '../../routes/(app)/planner/+page.server';
import { load as suggestLoad } from '../../routes/(app)/suggest/+page.server';

function event(path: string) {
	const url = new URL(`https://mealplanner.example.com${path}`);
	return { url, request: new Request(url) } as never;
}

type LoadCase = {
	name: string;
	load: (event: never) => unknown;
	path: string;
	fallback: Record<string, unknown>;
	forms: string[];
};

const cases: LoadCase[] = [
	{
		name: 'home',
		load: homeLoad,
		path: '/',
		fallback: { weekStartDate: '2026-09-28', entries: [], pantryCount: 0 },
		forms: []
	},
	{
		name: 'pantry',
		load: pantryLoad,
		path: '/pantry',
		fallback: { items: [] },
		forms: ['addForm']
	},
	{
		name: 'planner',
		load: plannerLoad,
		path: '/planner?week=2026-09-28',
		fallback: { entries: [], weekStartDate: '2026-09-28' },
		forms: ['addCustomForm']
	},
	{ name: 'suggest', load: suggestLoad, path: '/suggest', fallback: { pantryItems: [] }, forms: [] }
];

describe.each(cases)('$name load on a database failure', ({ load, path, fallback, forms }) => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty fallbacks and a loadError instead of throwing', async () => {
		const result = (await load(event(path))) as Record<string, unknown>;

		expect(result).toMatchObject(fallback);
		expect(result.loadError).toEqual(expect.stringMatching(/^Failed to load .+ Please try/));
		for (const form of forms) {
			expect(result[form]).toEqual(expect.objectContaining({ id: expect.any(String) }));
		}
	});

	it('logs the underlying error', async () => {
		await load(event(path));

		expect(mockState.loggerError).toHaveBeenCalledWith(
			expect.stringMatching(/^Failed to load /),
			mockState.dbError
		);
	});
});
