import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	api,
	findSessionSummariesMock,
	disableApiKeysForUserMock,
	loggerMock,
	sendWelcomeMock,
	sendAuthAlertsMock
} = vi.hoisted(() => ({
	api: {
		banUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		setRole: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		unbanUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		removeUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		createUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		getUser: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		listUsers: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		listUserSessions: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		revokeUserSessions: vi.fn<(...args: unknown[]) => Promise<unknown>>()
	},
	findSessionSummariesMock: vi.fn<(userIds: string[]) => Promise<unknown[]>>(),
	sendWelcomeMock: vi.fn<(user: unknown) => Promise<void>>(),
	sendAuthAlertsMock: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
	disableApiKeysForUserMock: vi.fn<(userId: string) => Promise<number>>(),
	loggerMock: {
		error: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		info: vi.fn<() => void>(),
		debug: vi.fn<() => void>()
	}
}));

vi.mock('$app/env/private', () => ({ ADMIN_USER_IDS: 'env-admin', FLY_APP_NAME: 'budget-test' }));

vi.mock('#lib/server/auth.js', () => ({
	auth: { api },
	allowedEmails: new Set(['admin@example.com', 'listed@example.com']),
	assertAdmin: (locals: App.Locals) => {
		if (locals.user?.role !== 'admin') throw new Error('Forbidden');
	}
}));

vi.mock('#lib/server/db/queries/index.js', () => ({
	sessionQueries: { findSummariesByUserIds: findSessionSummariesMock }
}));

vi.mock('#lib/server/db/writes/api-keys.js', () => ({
	disableApiKeysForUser: disableApiKeysForUserMock
}));

vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));

vi.mock('#lib/server/auth/welcome.js', () => ({ sendWelcome: sendWelcomeMock }));

vi.mock('#lib/server/notifications/index.js', () => ({ sendAuthAlerts: sendAuthAlertsMock }));

import type { UserWithSessions } from '#lib/types.js';

import { actions, load } from './+page.server';

const adminLocals = { user: { id: 'admin-1', role: 'admin' } } as App.Locals;
const LISTED = { id: 'u-2', name: 'Listed', email: 'listed@example.com' };

function post(fields: Record<string, string>) {
	return new Request('https://budget.example.com/admin/users', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
}

// The user-management behaviour itself is tested in @sheppakai/shared/admin-user-actions;
// these check this app's wiring (guard, API-key hook, welcome email, Fly app name).
describe('admin users actions — wiring', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.banUser.mockResolvedValue({ user: LISTED });
		api.getUser.mockResolvedValue(LISTED);
		api.createUser.mockResolvedValue({ user: { ...LISTED, email: 'new@example.com' } });
		api.revokeUserSessions.mockResolvedValue({});
		sendWelcomeMock.mockResolvedValue(undefined);
		disableApiKeysForUserMock.mockResolvedValue(1);
	});

	it.each([
		'setRole',
		'banUser',
		'unbanUser',
		'removeUser',
		'createUser',
		'sendWelcomeEmail',
		'setPassword',
		'revokeSession'
	] as const)('%s is admin-only', async (name) => {
		const result = await actions[name]({
			request: post({ userId: LISTED.id }),
			locals: { user: { id: 'u-3', role: 'user' } } as App.Locals
		} as never);

		expect(result).toMatchObject({ status: 403 });
	});

	it("banUser disables the banned user's API keys", async () => {
		await actions.banUser({ request: post({ userId: LISTED.id }), locals: adminLocals } as never);

		expect(disableApiKeysForUserMock).toHaveBeenCalledWith(LISTED.id);
	});

	it('sendWelcomeEmail sends the set-password welcome email', async () => {
		await actions.sendWelcomeEmail({
			request: post({ userId: LISTED.id }),
			locals: adminLocals
		} as never);

		expect(sendWelcomeMock).toHaveBeenCalledWith(LISTED);
	});

	it('createUser points the allowlist hint at this Fly app', async () => {
		const result = await actions.createUser({
			request: post({ name: 'New', email: 'new@example.com', role: 'user' }),
			locals: adminLocals
		} as never);

		expect(result).toMatchObject({ allowlistCommand: expect.stringMatching(/-a budget-test$/) });
		expect(sendWelcomeMock).not.toHaveBeenCalled();
	});

	it('revokeSession revokes every session of the posted userId', async () => {
		const result = await actions.revokeSession({
			request: post({ userId: LISTED.id }),
			locals: adminLocals
		} as never);

		expect(api.revokeUserSessions).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: LISTED.id } })
		);
		expect(result).toMatchObject({ form: { message: { type: 'success' } } });
	});
});

describe('admin users load: sessions', () => {
	type LoadEvent = Parameters<typeof load>[0];
	type LoadResult = { usersWithSessions: UserWithSessions[]; loadError?: string };
	const loadEvent = {
		request: new Request('https://budget.example.com/admin/users'),
		url: new URL('https://budget.example.com/admin/users'),
		route: { id: '/(app)/admin/users' },
		locals: adminLocals
	} as unknown as LoadEvent;

	beforeEach(() => {
		vi.clearAllMocks();
		api.listUsers.mockResolvedValue({
			users: [
				{ id: 'u1', name: 'One', email: 'one@example.com' },
				{ id: 'u2', name: 'Two', email: 'two@example.com' }
			]
		});
	});

	it("loads every listed user's sessions in one query and groups them by user", async () => {
		findSessionSummariesMock.mockResolvedValueOnce([
			{ id: 's1', userId: 'u1', expiresAt: new Date(), createdAt: new Date() },
			{ id: 's2', userId: 'u1', expiresAt: new Date(), createdAt: new Date() }
		]);

		const result = (await load(loadEvent)) as LoadResult;

		expect(findSessionSummariesMock).toHaveBeenCalledOnce();
		expect(findSessionSummariesMock).toHaveBeenCalledWith(['u1', 'u2']);
		expect(api.listUserSessions).not.toHaveBeenCalled();
		expect(result.usersWithSessions.map((u) => [u.id, u.sessions.map((s) => s.id)])).toEqual([
			['u1', ['s1', 's2']],
			['u2', []]
		]);
	});

	it('returns the load-error fallback when the session query fails', async () => {
		findSessionSummariesMock.mockRejectedValueOnce(new Error('db down'));

		const result = (await load(loadEvent)) as LoadResult;

		expect(result.usersWithSessions).toEqual([]);
		expect(result.loadError).toBeDefined();
		expect(loggerMock.error).toHaveBeenCalled();
	});
});
