import { describe, expect, it } from 'vitest';

import { DUMMY_ENV, sharedEnvVars } from './env';

const runtime = sharedEnvVars(false);
const build = sharedEnvVars(true);

const guardedNames = [
	'DATABASE_URL',
	'BETTER_AUTH_SECRET',
	'BREVO_API_KEY',
	'BREVO_FROM_ADDRESS',
	'ADMIN_USER_IDS'
] as const;

describe('sharedEnvVars at build time', () => {
	it.each(guardedNames)('%s falls back to its placeholder when unset', (name) => {
		expect(build[name].schema.parse(undefined)).toBe(DUMMY_ENV[name]);
	});

	it('lets ALLOWED_EMAILS and BETTER_AUTH_BASE_URL be unset', () => {
		expect(build.ALLOWED_EMAILS.schema.parse(undefined)).toBe('');
		expect(build.BETTER_AUTH_BASE_URL.schema.parse(undefined)).toBe('http://localhost:5173');
	});
});

describe('sharedEnvVars at runtime', () => {
	it.each(guardedNames)('%s rejects the build-time placeholder', (name) => {
		expect(runtime[name].schema.safeParse(DUMMY_ENV[name]).success).toBe(false);
	});

	it.each(guardedNames)('%s rejects a missing value', (name) => {
		expect(runtime[name].schema.safeParse(undefined).success).toBe(false);
	});

	it('accepts real values', () => {
		expect(runtime.DATABASE_URL.schema.parse('file://data/app.db')).toBe('file://data/app.db');
		expect(runtime.BETTER_AUTH_SECRET.schema.parse('x'.repeat(32))).toHaveLength(32);
		expect(runtime.BREVO_FROM_ADDRESS.schema.parse('hello@sheppakai.com')).toBe(
			'hello@sheppakai.com'
		);
		expect(runtime.ADMIN_USER_IDS.schema.parse('abc123')).toBe('abc123');
	});

	it('enforces the 32-character secret minimum and a valid from address', () => {
		expect(runtime.BETTER_AUTH_SECRET.schema.safeParse('short').success).toBe(false);
		expect(runtime.BREVO_FROM_ADDRESS.schema.safeParse('not-an-email').success).toBe(false);
	});

	it('requires ALLOWED_EMAILS and a URL for BETTER_AUTH_BASE_URL', () => {
		expect(runtime.ALLOWED_EMAILS.schema.safeParse('').success).toBe(false);
		expect(runtime.BETTER_AUTH_BASE_URL.schema.safeParse(undefined).success).toBe(false);
		expect(runtime.BETTER_AUTH_BASE_URL.schema.parse('https://example.com')).toBe(
			'https://example.com'
		);
	});

	it('fails closed on AUTH_ALERTS_URL and defaults NODE_ENV to development', () => {
		expect(runtime.AUTH_ALERTS_URL.schema.parse(undefined)).toBe('https://auth-alerts.invalid');
		expect(runtime.NODE_ENV.schema.parse(undefined)).toBe('development');
		expect(runtime.LOG_LEVEL.schema.parse(undefined)).toBeUndefined();
		expect(runtime.LOG_LEVEL.schema.safeParse('verbose').success).toBe(false);
	});
});
