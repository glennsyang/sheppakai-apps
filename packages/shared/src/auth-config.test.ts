import type { BetterAuthPlugin } from 'better-auth';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { createAppAuth } from './auth-config';

function buildAuth(overrides: { nodeEnv?: string; plugins?: BetterAuthPlugin[] } = {}) {
	return createAppAuth({
		appName: 'Test App',
		cookiePrefix: 'test_app',
		secret: 'test-secret-that-is-long-enough-for-better-auth',
		baseURL: 'https://app.example.com',
		nodeEnv: overrides.nodeEnv ?? 'production',
		adminUserIds: 'admin-1,admin-2',
		allowedEmails: new Set(['a@example.com']),
		db: drizzle(new Database(':memory:')),
		tables: {},
		findUserEmail: async () => undefined,
		email: {
			sendPasswordResetEmail: vi.fn<() => Promise<void>>(),
			sendVerificationEmail: vi.fn<() => Promise<void>>(),
			sendPasswordChangedEmail: vi.fn<() => Promise<void>>(),
			sendNewUserEmail: vi.fn<() => void>()
		},
		sendAuthAlerts: vi.fn<() => void>(),
		logger: { debug: vi.fn<() => void>(), info: vi.fn<() => void>(), error: vi.fn<() => void>() },
		getRequestEvent: vi.fn<() => never>(),
		plugins: overrides.plugins
	});
}

describe('createAppAuth', () => {
	it('keeps the invite-only, verified, hashed-token policy', () => {
		const { options } = buildAuth();
		expect(options.emailAndPassword).toMatchObject({
			disableSignUp: true,
			requireEmailVerification: true,
			minPasswordLength: 12,
			revokeSessionsOnPasswordReset: true,
			resetPasswordTokenExpiresIn: 600
		});
		expect(options.emailVerification?.expiresIn).toBe(3600);
		expect(options.verification?.storeIdentifier).toBe('hashed');
		expect(options.session?.cookieCache?.enabled).toBe(false);
	});

	it('applies the per-app name and cookie prefix', () => {
		const { options } = buildAuth();
		expect(options.appName).toBe('Test App');
		expect(options.advanced?.cookiePrefix).toBe('test_app');
	});

	it('uses database rate-limit storage only in production', () => {
		expect(buildAuth().options.rateLimit?.storage).toBe('database');
		expect(buildAuth({ nodeEnv: 'development' }).options.rateLimit?.storage).toBe('memory');
	});

	it('trusts localhost:5173 only in development', () => {
		expect(buildAuth().options.trustedOrigins).toEqual(['https://app.example.com']);
		expect(buildAuth({ nodeEnv: 'development' }).options.trustedOrigins).toContain(
			'http://localhost:5173'
		);
	});

	it('inserts app plugins before the SvelteKit cookie plugin, which stays last', () => {
		const extra = { id: 'extra-plugin' } satisfies BetterAuthPlugin;
		const ids = buildAuth({ plugins: [extra] }).options.plugins?.map((p) => p.id);
		expect(ids).toEqual(['admin', 'have-i-been-pwned', 'extra-plugin', 'sveltekit-cookies']);
	});
});
