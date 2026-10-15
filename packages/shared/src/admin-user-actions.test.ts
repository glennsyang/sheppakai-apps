import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminUserActions, type AdminUserActionsDeps } from './admin-user-actions';

const ADMIN = { id: 'admin-1', role: 'admin', email: 'admin@example.com' };
const TARGET = { id: 'user-2', email: 'target@example.com', name: 'Target' };

const api = {
	setRole: vi.fn<(ctx: unknown) => Promise<{ user: { email: string } }>>(),
	banUser: vi.fn<(ctx: unknown) => Promise<{ user: { email: string } }>>(),
	unbanUser: vi.fn<(ctx: unknown) => Promise<unknown>>(),
	removeUser: vi.fn<(ctx: unknown) => Promise<unknown>>(),
	getUser: vi.fn<(ctx: unknown) => Promise<typeof TARGET>>(),
	createUser: vi.fn<(ctx: unknown) => Promise<{ user: typeof TARGET }>>()
};
const sendWelcome = vi.fn<(user: typeof TARGET) => Promise<void>>();
const sendAuthAlerts = vi.fn<(message: string, title: string, priority: number) => unknown>();
const disableApiKeysForUser = vi.fn<(userId: string) => Promise<number>>();
const logger = {
	info: vi.fn<(message: string, meta?: Record<string, unknown>) => void>(),
	warn: vi.fn<(message: string, meta?: Record<string, unknown>) => void>(),
	error: vi.fn<(message: string, error?: unknown) => void>()
};

function makeActions(overrides: Partial<AdminUserActionsDeps> = {}) {
	return createAdminUserActions({
		appName: 'TestApp',
		auth: { api } as unknown as AdminUserActionsDeps['auth'],
		isAdminUser: (user) => user.role === 'admin',
		allowedEmails: new Set(['admin@example.com', 'target@example.com']),
		flyAppName: 'test-app',
		sendWelcome,
		sendAuthAlerts,
		logger,
		disableApiKeysForUser,
		...overrides
	});
}

type Result = {
	status?: number;
	form?: { message?: unknown };
	data?: { form?: { message?: unknown } };
};

async function run(
	actions: ReturnType<typeof makeActions>,
	name: keyof ReturnType<typeof makeActions>,
	fields: Record<string, string>,
	user: unknown = ADMIN
): Promise<Result & Record<string, unknown>> {
	const request = new Request('https://app.example.com/admin', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
	return (await actions[name]({ request, locals: { user } } as never)) as never;
}

const messageOf = (result: Result) => result.form?.message ?? result.data?.form?.message;

beforeEach(() => {
	vi.clearAllMocks();
	api.setRole.mockResolvedValue({ user: TARGET });
	api.banUser.mockResolvedValue({ user: TARGET });
	api.unbanUser.mockResolvedValue({});
	api.removeUser.mockResolvedValue({ success: true });
	api.getUser.mockResolvedValue(TARGET);
	api.createUser.mockResolvedValue({ user: TARGET });
	sendWelcome.mockResolvedValue(undefined);
	disableApiKeysForUser.mockResolvedValue(1);
});

describe('admin guard', () => {
	it.each([
		'setRole',
		'banUser',
		'unbanUser',
		'removeUser',
		'createUser',
		'sendWelcomeEmail'
	] as const)('%s rejects a non-admin with a 403 form message and calls nothing', async (name) => {
		const result = await run(
			makeActions(),
			name,
			{ userId: TARGET.id, role: 'user' },
			{
				id: 'u-3',
				role: 'user'
			}
		);

		expect(result.status).toBe(403);
		expect(messageOf(result)).toEqual({ type: 'error', text: 'Forbidden' });
		for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
	});

	it('rejects a signed-out caller with 401', async () => {
		const result = await run(makeActions(), 'unbanUser', { userId: TARGET.id }, null);

		expect(result.status).toBe(401);
	});

	it('rejects an invalid form with 400', async () => {
		const result = await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'owner' });

		expect(result.status).toBe(400);
		expect(api.setRole).not.toHaveBeenCalled();
	});
});

describe('self-action guards', () => {
	it.each([
		['setRole', { userId: ADMIN.id, role: 'user' }, 'You cannot change your own role'],
		['banUser', { userId: ADMIN.id }, 'You cannot ban yourself'],
		['removeUser', { userId: ADMIN.id }, 'You cannot remove your own account']
	] as const)('%s refuses to target the acting admin', async (name, fields, text) => {
		const result = await run(makeActions(), name, fields);

		expect(result.status).toBe(400);
		expect(messageOf(result)).toEqual({ type: 'error', text });
		expect(api[name]).not.toHaveBeenCalled();
	});
});

describe('setRole', () => {
	it('changes the role with the request headers, alerts, and disables keys on demotion', async () => {
		const result = await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'user' });

		expect(api.setRole).toHaveBeenCalledWith({
			body: { userId: TARGET.id, role: 'user' },
			headers: expect.any(Headers)
		});
		expect(sendAuthAlerts).toHaveBeenCalledWith(
			expect.stringContaining('target@example.com'),
			'TestApp - Role Changed Alert',
			3
		);
		expect(disableApiKeysForUser).toHaveBeenCalledWith(TARGET.id);
		expect(messageOf(result)).toEqual({ type: 'success', text: 'Role changed to user.' });
	});

	it('leaves keys alone on promotion', async () => {
		await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'admin' });

		expect(disableApiKeysForUser).not.toHaveBeenCalled();
	});

	it('reports a 500 when the demotion succeeds but disabling keys fails', async () => {
		disableApiKeysForUser.mockRejectedValue(new Error('db down'));

		const result = await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'user' });

		expect(result.status).toBe(500);
		expect(messageOf(result)).toEqual({
			type: 'error',
			text: 'Role changed, but failed to disable their API keys'
		});
	});

	it('surfaces a better-auth APIError with its status and message', async () => {
		api.setRole.mockRejectedValue(
			new APIError('FORBIDDEN', { message: 'You are not allowed to change roles' })
		);

		const result = await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'admin' });

		expect(result.status).toBe(403);
		expect(messageOf(result)).toEqual({
			type: 'error',
			text: 'You are not allowed to change roles'
		});
		expect(logger.warn).toHaveBeenCalled();
	});

	it('returns a generic 500 for an unexpected error', async () => {
		api.setRole.mockRejectedValue(new Error('network'));

		const result = await run(makeActions(), 'setRole', { userId: TARGET.id, role: 'admin' });

		expect(result.status).toBe(500);
		expect(messageOf(result)).toEqual({ type: 'error', text: 'Failed to change user role' });
		expect(logger.error).toHaveBeenCalled();
	});
});

describe('banUser', () => {
	it('forwards a reason, alerts and disables keys', async () => {
		const result = await run(makeActions(), 'banUser', { userId: TARGET.id, banReason: 'spam' });

		expect(api.banUser).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: TARGET.id, banReason: 'spam' } })
		);
		expect(sendAuthAlerts).toHaveBeenCalledOnce();
		expect(disableApiKeysForUser).toHaveBeenCalledWith(TARGET.id);
		expect(messageOf(result)).toEqual({ type: 'success', text: 'User banned.' });
	});

	it('omits an empty reason', async () => {
		await run(makeActions(), 'banUser', { userId: TARGET.id, banReason: '' });

		expect(api.banUser).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: TARGET.id } })
		);
	});

	it('does not touch keys when the ban fails', async () => {
		api.banUser.mockRejectedValue(new Error('nope'));

		await run(makeActions(), 'banUser', { userId: TARGET.id });

		expect(disableApiKeysForUser).not.toHaveBeenCalled();
	});

	it('works without a disableApiKeysForUser hook (apps with no API keys)', async () => {
		const result = await run(makeActions({ disableApiKeysForUser: undefined }), 'banUser', {
			userId: TARGET.id
		});

		expect(messageOf(result)).toEqual({ type: 'success', text: 'User banned.' });
	});
});

describe('unbanUser and removeUser', () => {
	it('unbans the user', async () => {
		const result = await run(makeActions(), 'unbanUser', { userId: TARGET.id });

		expect(api.unbanUser).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: TARGET.id } })
		);
		expect(messageOf(result)).toEqual({ type: 'success', text: 'User unbanned.' });
	});

	it('looks the user up, removes them and alerts with their email', async () => {
		const result = await run(makeActions(), 'removeUser', { userId: TARGET.id });

		expect(api.removeUser).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: TARGET.id } })
		);
		expect(sendAuthAlerts.mock.calls[0][0]).toContain('target@example.com');
		expect(messageOf(result)).toEqual({ type: 'success', text: 'User removed.' });
	});

	it('returns 404 for an unknown user without removing anything', async () => {
		api.getUser.mockRejectedValue(new APIError('NOT_FOUND', { message: 'User not found' }));

		const result = await run(makeActions(), 'removeUser', { userId: 'missing' });

		expect(result.status).toBe(404);
		expect(api.removeUser).not.toHaveBeenCalled();
	});
});

describe('createUser', () => {
	const fields = { name: 'Target', email: ' Target@Example.com ', role: 'user' };

	it('creates the user with the request headers and a generated password, then sends the welcome email', async () => {
		const result = await run(makeActions(), 'createUser', fields);

		expect(api.createUser).toHaveBeenCalledWith({
			body: {
				name: 'Target',
				email: 'target@example.com',
				role: 'user',
				password: expect.stringMatching(/^[\w-]{40,}$/)
			},
			headers: expect.any(Headers)
		});
		expect(sendWelcome).toHaveBeenCalledWith(TARGET);
		expect(messageOf(result)).toEqual({
			type: 'success',
			text: 'User created and welcome email sent to target@example.com.'
		});
	});

	it('never puts the generated password in logs or alerts', async () => {
		await run(makeActions(), 'createUser', fields);

		const { password } = (api.createUser.mock.calls[0][0] as { body: { password: string } }).body;
		const logged = JSON.stringify([logger.info.mock.calls, sendAuthAlerts.mock.calls]);
		expect(logged).not.toContain(password);
	});

	it('holds the welcome email and returns the fly command when not allowlisted', async () => {
		const result = await run(makeActions(), 'createUser', { ...fields, email: 'new@example.com' });

		expect(sendWelcome).not.toHaveBeenCalled();
		expect(result.allowlistCommand).toBe(
			'fly secrets set ALLOWED_EMAILS="admin@example.com,target@example.com,new@example.com" -a test-app'
		);
	});

	it('reports a failed welcome email with a 200 so the user list still refreshes', async () => {
		sendWelcome.mockRejectedValue(new Error('brevo down'));

		const result = await run(makeActions(), 'createUser', fields);

		expect(result.status).toBeUndefined();
		expect(messageOf(result)).toMatchObject({ type: 'error' });
	});

	it('puts a duplicate-email error on the email field', async () => {
		api.createUser.mockRejectedValue(
			new APIError('BAD_REQUEST', {
				code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
				message: 'User already exists'
			})
		);

		const result = (await run(makeActions(), 'createUser', fields)) as {
			status: number;
			data: { form: { errors: { email?: string[] } } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.email).toEqual(['A user with this email already exists.']);
	});
});

describe('sendWelcomeEmail', () => {
	it('sends the welcome email to an allowlisted user', async () => {
		const result = await run(makeActions(), 'sendWelcomeEmail', { userId: TARGET.id });

		expect(sendWelcome).toHaveBeenCalledWith(TARGET);
		expect(messageOf(result)).toEqual({
			type: 'success',
			text: 'Welcome email sent to target@example.com.'
		});
	});

	it('refuses and prints the fly command when the user is not allowlisted', async () => {
		api.getUser.mockResolvedValue({ ...TARGET, email: 'new@example.com' });

		const result = await run(makeActions(), 'sendWelcomeEmail', { userId: TARGET.id });

		expect(result.status).toBe(400);
		expect(messageOf(result)).toMatchObject({
			text: expect.stringContaining('fly secrets set ALLOWED_EMAILS=')
		});
		expect(sendWelcome).not.toHaveBeenCalled();
	});

	it('reports a 500 when the send fails', async () => {
		sendWelcome.mockRejectedValue(new Error('brevo down'));

		const result = await run(makeActions(), 'sendWelcomeEmail', { userId: TARGET.id });

		expect(result.status).toBe(500);
	});
});
