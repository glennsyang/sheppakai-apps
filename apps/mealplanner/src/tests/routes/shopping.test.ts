import { beforeEach, describe, expect, it, vi } from 'vitest';

const { shoppingMock, loggerMock } = vi.hoisted(() => ({
	shoppingMock: {
		syncShoppingList: vi.fn<(userId: string | null, week: string) => Promise<unknown[]>>(),
		addManualItem: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({}),
		removeManualItem: vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true),
		setShoppingItemChecked: vi
			.fn<(userId: string, id: string, checked: boolean) => Promise<boolean>>()
			.mockResolvedValue(true)
	},
	loggerMock: {
		debug: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

vi.mock('#lib/server/services/shoppingList.js', () => shoppingMock);
vi.mock('#lib/server/services/mealPlan.js', () => ({
	getMondayOfCurrentWeek: () => '2026-11-16'
}));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

import { actions, load } from '../../routes/(app)/shopping/+page.server';

const USER = { id: 'user_1', name: 'Alice', email: 'alice@example.com', role: 'user' };

const ctx = (locals: Partial<App.Locals>, fields: Record<string, string> = {}) =>
	({
		request: new Request('https://example.com/', {
			method: 'POST',
			body: new URLSearchParams(fields)
		}),
		locals
	}) as never;

const loadCtx = (search: string) =>
	({
		request: new Request(`https://example.com/shopping${search}`),
		url: new URL(`https://example.com/shopping${search}`),
		route: { id: '/(app)/shopping' },
		locals: { user: USER }
	}) as never;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('shopping load', () => {
	it('syncs the current week by default', async () => {
		shoppingMock.syncShoppingList.mockResolvedValue([{ id: 'i1' }]);
		const data = (await load(loadCtx(''))) as { items: unknown[]; weekStartDate: string };
		expect(data.weekStartDate).toBe('2026-11-16');
		expect(data.items).toEqual([{ id: 'i1' }]);
		expect(shoppingMock.syncShoppingList).toHaveBeenCalledWith('user_1', '2026-11-16');
	});

	it('redirects a non-Monday week to its Monday', async () => {
		await expect(load(loadCtx('?week=2026-11-18'))).rejects.toMatchObject({
			status: 302,
			location: '/shopping?week=2026-11-16'
		});
	});

	it('returns a loadError instead of throwing when the sync fails', async () => {
		shoppingMock.syncShoppingList.mockRejectedValue(new Error('db down'));
		const data = (await load(loadCtx('?week=2026-11-23'))) as {
			items: unknown[];
			loadError: string;
		};
		expect(data.items).toEqual([]);
		expect(data.loadError).toMatch(/shopping list/);
	});
});

describe('shopping actions', () => {
	it.each([
		['toggle', actions.toggle, { id: 'i1', checked: 'true' }],
		['addItem', actions.addItem, { weekStartDate: '2026-11-16', name: 'Foil' }],
		['removeItem', actions.removeItem, { id: 'i1' }]
	] as const)('%s returns 401 when signed out', async (_name, action, fields) => {
		const result = await action(ctx({}, fields));
		expect(result).toMatchObject({ status: 401 });
		for (const mock of Object.values(shoppingMock)) expect(mock).not.toHaveBeenCalled();
	});

	it('toggle passes the target state as a boolean', async () => {
		await actions.toggle(ctx({ user: USER } as never, { id: 'i1', checked: 'true' }));
		await actions.toggle(ctx({ user: USER } as never, { id: 'i1', checked: 'false' }));
		expect(shoppingMock.setShoppingItemChecked.mock.calls).toEqual([
			['user_1', 'i1', true],
			['user_1', 'i1', false]
		]);
	});

	it('toggle answers with an error message for an unknown item', async () => {
		shoppingMock.setShoppingItemChecked.mockResolvedValueOnce(false);
		const result = await actions.toggle(
			ctx({ user: USER } as never, { id: 'gone', checked: 'true' })
		);
		expect(result).toMatchObject({ status: 500, data: { form: { message: { type: 'error' } } } });
	});

	it('addItem stores a manual item for the week', async () => {
		const result = await actions.addItem(
			ctx({ user: USER } as never, {
				weekStartDate: '2026-11-16',
				name: 'Foil',
				quantity: '2',
				unit: 'rolls'
			})
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
		expect(shoppingMock.addManualItem).toHaveBeenCalledWith('user_1', '2026-11-16', {
			name: 'Foil',
			quantity: 2,
			unit: 'rolls'
		});
	});

	it('addItem rejects a week that is not a Monday', async () => {
		const result = await actions.addItem(
			ctx({ user: USER } as never, { weekStartDate: '2026-11-17', name: 'Foil' })
		);
		expect(result).toMatchObject({ status: 400 });
		expect(shoppingMock.addManualItem).not.toHaveBeenCalled();
	});
});
