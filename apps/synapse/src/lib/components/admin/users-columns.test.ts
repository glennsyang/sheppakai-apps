import type { User } from '$lib/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/components/ui/data-table', () => ({
	renderComponent: (component: unknown, props: Record<string, unknown>) => ({
		component,
		props
	})
}));
vi.mock('./DataTableSortButton.svelte', () => ({
	default: 'DataTableSortButton'
}));
vi.mock('./RoleBadge.svelte', () => ({ default: 'RoleBadge' }));
vi.mock('./StatusBadge.svelte', () => ({ default: 'StatusBadge' }));
vi.mock('./users-table-actions.svelte', () => ({
	default: 'UsersTableActions'
}));

import { makeColumns } from './users-columns';

type AnyFn = (ctx: unknown, index?: number) => unknown;

function column(key: string) {
	const col = makeColumns('current-user').find(
		(c) => ('accessorKey' in c && c.accessorKey === key) || c.id === key
	);
	if (!col) throw new Error(`column ${key} not found`);
	return col as unknown as {
		header: AnyFn | string;
		cell: AnyFn;
		accessorFn: AnyFn;
	};
}

function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: 'u1',
		name: 'Ada',
		email: 'ada@example.com',
		role: 'admin',
		banned: false,
		createdAt: new Date('2026-01-15T12:00:00Z'),
		...overrides
	} as User;
}

const cellCtx = (user: User) => ({ row: { original: user } });

describe('makeColumns', () => {
	it('renders sortable headers for email and name', () => {
		const handler = vi.fn<() => void>();
		const ctx = { column: { getToggleSortingHandler: () => handler } };

		expect((column('email').header as AnyFn)(ctx)).toEqual({
			component: 'DataTableSortButton',
			props: { columnName: 'Email', onclick: handler }
		});
		expect((column('name').header as AnyFn)(ctx)).toEqual({
			component: 'DataTableSortButton',
			props: { columnName: 'Name', onclick: handler }
		});
	});

	it('renders the role badge, defaulting a missing role to user', () => {
		const role = column('role');
		expect(role.cell(cellCtx(makeUser()))).toEqual({
			component: 'RoleBadge',
			props: { role: 'admin' }
		});
		expect(role.cell(cellCtx(makeUser({ role: undefined })))).toEqual({
			component: 'RoleBadge',
			props: { role: 'user' }
		});
	});

	it('derives status from banned and renders the status badge', () => {
		const status = column('status');
		expect(status.accessorFn(makeUser({ banned: true }))).toBe('Banned');
		expect(status.accessorFn(makeUser({ banned: false }))).toBe('Active');
		expect(status.cell(cellCtx(makeUser({ banned: true })))).toEqual({
			component: 'StatusBadge',
			props: { banned: true }
		});
	});

	it('formats createdAt as a locale date string', () => {
		const user = makeUser();
		expect(column('createdAt').cell(cellCtx(user))).toBe(
			new Date(user.createdAt).toLocaleDateString()
		);
	});

	it('passes the user and current user id to the actions cell', () => {
		const user = makeUser();
		expect(column('actions').cell(cellCtx(user))).toEqual({
			component: 'UsersTableActions',
			props: { user, currentUserId: 'current-user' }
		});
	});
});
