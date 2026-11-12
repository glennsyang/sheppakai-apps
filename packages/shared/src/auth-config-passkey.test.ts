import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The drizzle adapter checks the full schema before every query, so these flow tests run
// createAppAuth on Better Auth's in-memory adapter instead: real users, sessions and
// passkeys, with every hook and plugin wired as in the apps.
const memory = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('better-auth/adapters/drizzle', () => ({
	drizzleAdapter: () => memoryAdapter(memory.db)
}));

import { createAppAuth } from './auth-config';

const email = {
	sendPasswordResetEmail: vi.fn<() => Promise<void>>(),
	sendVerificationEmail: vi.fn<() => Promise<void>>(),
	sendPasswordChangedEmail: vi.fn<(payload: unknown) => Promise<void>>(),
	sendPasskeyAddedEmail: vi.fn<() => Promise<void>>(),
	sendNewUserEmail: vi.fn<() => void>()
};
const sendAuthAlerts = vi.fn<(message: string, title: string, priority: number) => void>();
const logger = {
	debug: vi.fn<() => void>(),
	info: vi.fn<() => void>(),
	error: vi.fn<(message: string, error?: unknown) => void>()
};

function buildAuth() {
	return createAppAuth({
		appName: 'Test App',
		cookiePrefix: 'test_app',
		secret: 'test-secret-that-is-long-enough-for-better-auth',
		baseURL: 'https://app.example.com',
		nodeEnv: 'test',
		adminUserIds: 'admin-1',
		allowedEmails: new Set(['a@example.com', 'b@example.com']),
		db: {},
		// Only the key matters here (it turns passkeys on); the memory adapter ignores tables.
		tables: { passkey: {} },
		email,
		sendAuthAlerts,
		logger,
		getRequestEvent: vi.fn<() => never>()
	});
}

function user(id: string, address: string, extra: Record<string, unknown> = {}) {
	const now = new Date();
	return {
		id,
		email: address,
		name: id,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
		role: 'user',
		banned: false,
		...extra
	};
}

function passkeyRow(id: string, userId: string) {
	return {
		id,
		userId,
		name: id,
		publicKey: 'pk',
		credentialID: `cred-${id}`,
		counter: 0,
		deviceType: 'singleDevice',
		backedUp: false,
		transports: '',
		createdAt: new Date()
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	email.sendPasswordChangedEmail.mockResolvedValue(undefined);
	for (const key of Object.keys(memory.db)) delete memory.db[key];
	Object.assign(memory.db, {
		user: [],
		session: [],
		account: [],
		verification: [],
		rateLimit: [],
		passkey: []
	});
});

describe('createAppAuth with passkeys', () => {
	// /passkey/verify-authentication ends in `internalAdapter.createSession(passkey.userId)`,
	// which runs every databaseHooks.session.create.before guard. Calling it directly runs
	// the same chain without forging a WebAuthn assertion.
	async function passkeySignIn(userId: string) {
		const { internalAdapter } = await buildAuth().$context;
		return internalAdapter.createSession(userId);
	}

	it('signs in an allowlisted user', async () => {
		memory.db.user.push(user('user-a', 'a@example.com'));

		await expect(passkeySignIn('user-a')).resolves.toMatchObject({ userId: 'user-a' });
		expect(memory.db.session).toHaveLength(1);
	});

	it('refuses a user removed from ALLOWED_EMAILS who still has a passkey', async () => {
		memory.db.user.push(user('user-x', 'removed@example.com'));
		memory.db.passkey.push(passkeyRow('pk-x', 'user-x'));

		await expect(passkeySignIn('user-x')).rejects.toThrow('Invalid email or password');
		expect(memory.db.session).toHaveLength(0);
	});

	it('refuses a banned user', async () => {
		memory.db.user.push(user('user-a', 'a@example.com', { banned: true }));

		await expect(passkeySignIn('user-a')).rejects.toMatchObject({
			body: { code: 'BANNED_USER' }
		});
		expect(memory.db.session).toHaveLength(0);
	});

	it('returns 401 for /passkey/generate-register-options without a session', async () => {
		const response = await buildAuth().handler(
			new Request('https://app.example.com/api/auth/passkey/generate-register-options')
		);

		expect(response.status).toBe(401);
	});

	it("deletes all of the user's passkeys on password reset and no one else's", async () => {
		memory.db.passkey.push(
			passkeyRow('pk-a1', 'user-a'),
			passkeyRow('pk-a2', 'user-a'),
			passkeyRow('pk-b1', 'user-b')
		);
		const onPasswordReset = buildAuth().options.emailAndPassword?.onPasswordReset;
		if (!onPasswordReset) throw new Error('onPasswordReset missing');

		await onPasswordReset({ user: user('user-a', 'a@example.com') });

		expect(memory.db.passkey.map((row) => row.id)).toEqual(['pk-b1']);
		expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'a@example.com', passkeysRemoved: true })
		);
	});

	it('leaves passkeys out of the reset email when the user had none', async () => {
		const onPasswordReset = buildAuth().options.emailAndPassword?.onPasswordReset;
		if (!onPasswordReset) throw new Error('onPasswordReset missing');

		await onPasswordReset({ user: user('user-a', 'a@example.com') });

		expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ passkeysRemoved: false })
		);
	});

	it('alerts the operator and leaves passkeys out of the email when removal fails', async () => {
		memory.db.passkey.push(passkeyRow('pk-a1', 'user-a'));
		const auth = buildAuth();
		const { adapter } = await auth.$context;
		vi.spyOn(adapter, 'deleteMany').mockRejectedValueOnce(new Error('db locked'));
		const onPasswordReset = auth.options.emailAndPassword?.onPasswordReset;
		if (!onPasswordReset) throw new Error('onPasswordReset missing');

		await expect(
			onPasswordReset({ user: user('user-a', 'a@example.com') })
		).resolves.toBeUndefined();

		expect(memory.db.passkey).toHaveLength(1);
		expect(logger.error).toHaveBeenCalledWith(
			'Failed to remove passkeys after password reset',
			expect.any(Error)
		);
		expect(sendAuthAlerts).toHaveBeenCalledWith(
			expect.stringContaining('could not remove their passkeys'),
			'Test App - Security Alert: passkeys not removed',
			5
		);
		expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(
			expect.objectContaining({ passkeysRemoved: false })
		);
	});

	it('sends no failure alert when removal works', async () => {
		memory.db.passkey.push(passkeyRow('pk-a1', 'user-a'));
		const onPasswordReset = buildAuth().options.emailAndPassword?.onPasswordReset;
		if (!onPasswordReset) throw new Error('onPasswordReset missing');

		await onPasswordReset({ user: user('user-a', 'a@example.com') });

		expect(sendAuthAlerts).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining('passkeys not removed'),
			expect.anything()
		);
	});
});
