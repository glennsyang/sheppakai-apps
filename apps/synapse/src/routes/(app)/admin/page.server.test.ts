import { isHttpError, isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDb = vi.hoisted(() => vi.fn<() => unknown>());
const mockFindMany = vi.hoisted(() => vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []));

// Stand-in for db.select().from().leftJoin().orderBy(), which resolves to no rows.
function selectChain(): unknown {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		orderBy: async () => []
	};
	return chain;
}

vi.mock('#lib/server/db/index.js', () => ({ getDb: mockGetDb }));

const mockCreateUser = vi.hoisted(() =>
	vi.fn<
		(args: {
			body: Record<string, string>;
		}) => Promise<{ user: { id: string; email: string; name: string } }>
	>()
);
const mockSendWelcome = vi.hoisted(() =>
	vi.fn<(user: { id: string; email: string; name: string }) => Promise<void>>()
);
const mockSendAuthAlerts = vi.hoisted(() => vi.fn<(message: string) => Promise<boolean>>());

vi.mock('$app/env/private', () => ({
	BETTER_AUTH_BASE_URL: 'https://synapse.example.com',
	FLY_APP_NAME: 'synapse-test',
	ADMIN_USER_IDS: ''
}));

const mockAdminApi = vi.hoisted(() => ({
	setRole: vi.fn<(args: unknown) => Promise<unknown>>(),
	banUser: vi.fn<(args: unknown) => Promise<unknown>>(),
	unbanUser: vi.fn<(args: unknown) => Promise<unknown>>(),
	removeUser: vi.fn<(args: unknown) => Promise<unknown>>(),
	getUser: vi.fn<(args: unknown) => Promise<unknown>>(),
	listUsers: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ users: [], total: 0 }))
}));

vi.mock('#lib/server/auth.js', () => ({
	auth: { api: { createUser: mockCreateUser, ...mockAdminApi } },
	allowedEmails: new Set(['admin@example.com', 'allowed@example.com'])
}));

vi.mock('#lib/server/auth/welcome.js', () => ({ sendWelcome: mockSendWelcome }));

vi.mock('#lib/server/notifications/index.js', () => ({ sendAuthAlerts: mockSendAuthAlerts }));

const mockLogger = vi.hoisted(() => ({
	debug: vi.fn<(...args: unknown[]) => void>(),
	info: vi.fn<(...args: unknown[]) => void>(),
	warn: vi.fn<(...args: unknown[]) => void>(),
	error: vi.fn<(...args: unknown[]) => void>()
}));

vi.mock('#lib/server/logger.js', () => ({ logger: mockLogger }));

const mockDisableApiKeysForUser = vi.hoisted(() =>
	vi.fn<(userId: string) => Promise<number>>(async () => 0)
);

vi.mock('#lib/server/api/api-key-store.js', () => ({
	apiKeyStore: {
		disableForUser: mockDisableApiKeysForUser,
		listAllWithOwner: async () => [],
		deleteById: async () => true
	}
}));

const { load, actions } = await import('./+page.server');

async function runLoad(locals: App.Locals): Promise<unknown> {
	const url = new URL('http://localhost/admin');
	return load({ locals, url, request: new Request(url) } as never);
}

describe('admin page load — role check', () => {
	beforeEach(() => {
		mockFindMany.mockClear();
		mockGetDb.mockReset();
		mockGetDb.mockImplementation(() => ({
			query: {
				user: { findMany: mockFindMany },
				people: { findMany: mockFindMany },
				apiAuditLog: { findMany: mockFindMany },
				visits: { findMany: mockFindMany }
			},
			select: selectChain
		}));
	});

	it('throws 403 for a non-admin without touching the database', async () => {
		const locals = { user: { id: 'user-a', role: 'user' } } as App.Locals;

		const err = await runLoad(locals).catch((e: unknown) => e);

		expect(isHttpError(err, 403)).toBe(true);
		expect(mockGetDb).not.toHaveBeenCalled();
		expect(mockFindMany).not.toHaveBeenCalled();
	});

	it('redirects to sign-in when there is no user', async () => {
		const err = await runLoad({} as App.Locals).catch((e: unknown) => e);

		expect(isRedirect(err)).toBe(true);
		expect(mockGetDb).not.toHaveBeenCalled();
	});

	it('returns dashboard data for an admin', async () => {
		const locals = { user: { id: 'admin-a', role: 'admin' } } as App.Locals;

		const data = await runLoad(locals);

		expect(mockGetDb).toHaveBeenCalled();
		expect(data).toMatchObject({ users: [], archivedPeople: [], apiKeys: [], apiLogs: [] });
		expect(data).toHaveProperty('createApiKeyForm');
	});
});

const ADMIN = { id: 'admin-a', role: 'admin', email: 'admin@example.com' };
const TARGET = { id: 'user-b', email: 'allowed@example.com', name: 'Target' };

type ActionResult = { status?: number; data?: Record<string, unknown> } & Record<string, unknown>;

async function runAction(
	name: keyof typeof actions,
	fields: Record<string, string>,
	localsUser: unknown = ADMIN
): Promise<ActionResult> {
	const url = new URL('http://localhost/admin');
	const request = new Request(url, { method: 'POST', body: new URLSearchParams(fields) });
	const locals = (localsUser ? { user: localsUser } : {}) as App.Locals;
	return (await actions[name]({ locals, url, request } as never)) as ActionResult;
}

// The user-management behaviour itself is tested in @sheppakai/shared/admin-user-actions;
// these check this app's wiring (guard, API-key hook, welcome email, Fly app name).
describe('admin user-management actions — wiring', () => {
	beforeEach(() => {
		for (const fn of Object.values(mockAdminApi)) fn.mockReset();
		mockAdminApi.banUser.mockResolvedValue({ user: TARGET });
		mockAdminApi.getUser.mockResolvedValue(TARGET);
		mockCreateUser.mockReset();
		mockCreateUser.mockResolvedValue({ user: { ...TARGET, email: 'new@example.com' } });
		mockSendWelcome.mockReset();
		mockSendWelcome.mockResolvedValue(undefined);
		mockSendAuthAlerts.mockReset();
		mockSendAuthAlerts.mockResolvedValue(true);
		mockDisableApiKeysForUser.mockReset();
		mockDisableApiKeysForUser.mockResolvedValue(1);
	});

	it.each([
		'setRole',
		'banUser',
		'unbanUser',
		'removeUser',
		'createUser',
		'sendWelcomeEmail'
	] as const)('%s is admin-only', async (name) => {
		const result = await runAction(name, { userId: TARGET.id }, { id: 'user-a', role: 'user' });

		expect(result.status).toBe(403);
	});

	it("banUser disables the user's API keys", async () => {
		await runAction('banUser', { userId: TARGET.id });

		expect(mockDisableApiKeysForUser).toHaveBeenCalledWith(TARGET.id);
	});

	it('sendWelcomeEmail sends the welcome email to the target user', async () => {
		await runAction('sendWelcomeEmail', { userId: TARGET.id });

		expect(mockSendWelcome).toHaveBeenCalledWith(TARGET);
	});

	it('createUser points the allowlist hint at this Fly app', async () => {
		const result = await runAction('createUser', { name: 'New', email: 'new@example.com' });

		expect(result.allowlistCommand).toMatch(/-a synapse-test$/);
		expect(mockSendWelcome).not.toHaveBeenCalled();
	});
});
