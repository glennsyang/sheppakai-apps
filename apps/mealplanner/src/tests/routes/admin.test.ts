import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, loggerMock, emailMock, alertsMock } = vi.hoisted(() => ({
	emailMock: vi.fn<(user: unknown) => Promise<void>>(),
	alertsMock: vi.fn<() => Promise<boolean>>(),
	apiMock: {
		createUser: vi.fn<() => Promise<unknown>>(),
		getUser: vi.fn<() => Promise<unknown>>(),
		listUsers: vi.fn<() => Promise<unknown>>(),
		setRole: vi.fn<() => Promise<unknown>>(),
		banUser: vi.fn<() => Promise<unknown>>(),
		unbanUser: vi.fn<() => Promise<unknown>>(),
		removeUser: vi.fn<() => Promise<unknown>>()
	},
	loggerMock: {
		info: vi.fn<() => void>(),
		warn: vi.fn<() => void>(),
		error: vi.fn<() => void>()
	}
}));

vi.mock('#lib/server/auth/index.js', () => ({
	auth: { api: apiMock },
	allowedEmails: new Set(['admin@example.com', 'listed@example.com'])
}));
vi.mock('#lib/server/logger.js', () => ({ logger: loggerMock }));
vi.mock('#lib/server/auth/welcome.js', () => ({ sendWelcome: emailMock }));
vi.mock('#lib/server/notifications/index.js', () => ({ sendAuthAlerts: alertsMock }));
vi.mock('$app/env/private', () => ({
	BETTER_AUTH_BASE_URL: 'https://app.example.com',
	FLY_APP_NAME: 'mealplanner-test',
	ADMIN_USER_IDS: ''
}));

import { isHttpError } from '@sveltejs/kit';

import { actions, load } from '../../routes/(app)/admin/+page.server';

const ADMIN = { id: 'admin_1', name: 'Admin', email: 'admin@example.com', role: 'admin' };
const PLAIN = { id: 'user_1', name: 'User', email: 'user@example.com', role: 'user' };
const LISTED = { id: 'user_2', name: 'Listed', email: 'listed@example.com' };

const ctx = (user: unknown, fields: Record<string, string>) =>
	({
		request: new Request('https://example.com/admin', {
			method: 'POST',
			body: new URLSearchParams(fields)
		}),
		locals: { user }
	}) as never;

// `load` is auto-wrapped by @sentry/sveltekit, which reads `event.url` / `event.route`.
const loadCtx = (user: unknown = ADMIN) =>
	({
		request: new Request('https://example.com/admin'),
		url: new URL('https://example.com/admin'),
		route: { id: '/(app)/admin' },
		locals: { user }
	}) as never;

beforeEach(() => {
	vi.clearAllMocks();
});

describe('admin load', () => {
	it('returns the user list from auth.api.listUsers with the allowlisted ids', async () => {
		apiMock.listUsers.mockResolvedValueOnce({ users: [PLAIN, LISTED], total: 2 });

		const result = await load(loadCtx());

		expect(result).toMatchObject({ users: [PLAIN, LISTED], allowlistedIds: [LISTED.id] });
		expect(result).toHaveProperty('createForm');
		expect(result).not.toHaveProperty('allowlist');
	});

	it('throws 403 for a non-admin before calling the API', async () => {
		const err = await Promise.resolve(load(loadCtx(PLAIN))).catch((e: unknown) => e);

		expect(isHttpError(err, 403)).toBe(true);
		expect(apiMock.listUsers).not.toHaveBeenCalled();
	});

	it('falls back to an empty list and logs when the API throws', async () => {
		apiMock.listUsers.mockRejectedValueOnce(new Error('boom'));

		const result = await load(loadCtx());

		expect(result).toMatchObject({
			users: [],
			allowlistedIds: [],
			loadError: 'Failed to load users. Please try refreshing the page.'
		});
		expect(loggerMock.error).toHaveBeenCalled();
	});
});

// The user-management behaviour itself is tested in @sheppakai/shared/admin-user-actions;
// these check this app's wiring (guard, welcome email links, Fly app name).
describe('admin actions — wiring', () => {
	it.each([
		'setRole',
		'banUser',
		'unbanUser',
		'removeUser',
		'createUser',
		'sendWelcomeEmail'
	] as const)('%s is admin-only', async (name) => {
		const result = await actions[name](ctx(PLAIN, { userId: LISTED.id }));

		expect(result).toMatchObject({ status: 403 });
	});

	it('sends the welcome email to the target user', async () => {
		apiMock.getUser.mockResolvedValueOnce(LISTED);
		emailMock.mockResolvedValueOnce();

		await actions.sendWelcomeEmail(ctx(ADMIN, { userId: LISTED.id }));

		expect(emailMock).toHaveBeenCalledWith(LISTED);
	});

	it('points the allowlist hint at this Fly app', async () => {
		apiMock.createUser.mockResolvedValueOnce({
			user: { id: 'new_1', name: 'New', email: 'new@example.com' }
		});

		const result = await actions.createUser(
			ctx(ADMIN, { name: 'New', email: 'new@example.com', role: 'user' })
		);

		expect(result).toMatchObject({
			allowlistCommand: expect.stringMatching(/-a mealplanner-test$/)
		});
		expect(emailMock).not.toHaveBeenCalled();
	});
});
