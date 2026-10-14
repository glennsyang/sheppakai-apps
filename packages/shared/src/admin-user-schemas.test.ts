import { describe, expect, it } from 'vitest';

import {
	adminUserIdSchema,
	banUserSchema,
	createUserSchema,
	setRoleSchema
} from './admin-user-schemas';

describe('createUserSchema', () => {
	it('accepts a valid user and defaults the role to user', () => {
		const result = createUserSchema.safeParse({ name: 'Ada', email: 'ada@example.com' });
		expect(result.success).toBe(true);
		expect(result.data?.role).toBe('user');
	});

	it('trims the name and normalises the email', () => {
		const result = createUserSchema.safeParse({
			name: '  Ada  ',
			email: '  Ada@Example.COM ',
			role: 'admin'
		});
		expect(result.data).toEqual({ name: 'Ada', email: 'ada@example.com', role: 'admin' });
	});

	it('requires a name', () => {
		expect(createUserSchema.safeParse({ name: '   ', email: 'ada@example.com' }).success).toBe(
			false
		);
	});

	it('rejects an invalid email', () => {
		expect(createUserSchema.safeParse({ name: 'Ada', email: 'not-an-email' }).success).toBe(false);
	});

	it('rejects an unknown role', () => {
		expect(
			createUserSchema.safeParse({ name: 'Ada', email: 'ada@example.com', role: 'owner' }).success
		).toBe(false);
	});

	it('rejects an email over 254 characters', () => {
		const email = `${'a'.repeat(250)}@example.com`;
		expect(createUserSchema.safeParse({ name: 'Ada', email }).success).toBe(false);
	});
});

describe('setRoleSchema', () => {
	it('accepts a known role', () => {
		expect(setRoleSchema.safeParse({ userId: 'abc', role: 'admin' }).success).toBe(true);
	});

	it('rejects an unknown role', () => {
		expect(setRoleSchema.safeParse({ userId: 'abc', role: 'owner' }).success).toBe(false);
	});
});

describe('banUserSchema', () => {
	it('treats the reason as optional and trims it', () => {
		expect(banUserSchema.safeParse({ userId: 'abc' }).success).toBe(true);
		expect(banUserSchema.parse({ userId: 'abc', banReason: '  spam  ' }).banReason).toBe('spam');
	});

	it('rejects an overly long reason', () => {
		expect(banUserSchema.safeParse({ userId: 'abc', banReason: 'x'.repeat(501) }).success).toBe(
			false
		);
	});
});

describe('adminUserIdSchema', () => {
	it('requires a user id', () => {
		expect(adminUserIdSchema.safeParse({ userId: '' }).success).toBe(false);
		expect(adminUserIdSchema.safeParse({ userId: 'abc' }).success).toBe(true);
	});
});
