import { describe, expect, it } from 'vitest';

import {
	changePasswordSchema,
	forgotPasswordSchema,
	passwordSchema,
	resendVerificationSchema,
	resetPasswordSchema,
	signInSchema,
	updateNameSchema
} from './auth-schemas';

const STRONG = 'correct-horse-battery';

describe('passwordSchema', () => {
	it('requires at least 12 characters and nothing else', () => {
		expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
		expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false);
	});
});

describe('signInSchema', () => {
	it('accepts any non-empty password with a valid email', () => {
		expect(signInSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true);
	});

	it('rejects an invalid email or an empty password', () => {
		expect(signInSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
		expect(signInSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
	});
});

describe.each([
	['resendVerificationSchema', resendVerificationSchema],
	['forgotPasswordSchema', forgotPasswordSchema]
])('%s', (_name, schema) => {
	it('takes just a valid email', () => {
		expect(schema.safeParse({ email: 'user@example.com' }).success).toBe(true);
		expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false);
		expect(schema.safeParse({}).success).toBe(false);
	});
});

describe('resetPasswordSchema', () => {
	const valid = { password: STRONG, confirmPassword: STRONG, token: 'abc' };

	it('accepts matching passwords, with or without a token', () => {
		expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
		expect(resetPasswordSchema.safeParse({ ...valid, token: undefined }).success).toBe(true);
	});

	it('flags a mismatch on confirmPassword', () => {
		const result = resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'something-else' });
		expect(result.success).toBe(false);
		expect(result.error?.issues).toEqual([
			expect.objectContaining({ path: ['confirmPassword'], message: "Passwords don't match" })
		]);
	});

	it('rejects a short password and an empty confirmation', () => {
		expect(
			resetPasswordSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' })
				.success
		).toBe(false);
		expect(resetPasswordSchema.safeParse({ ...valid, confirmPassword: '' }).success).toBe(false);
	});
});

describe('changePasswordSchema', () => {
	const valid = { currentPassword: 'old', newPassword: STRONG, confirmPassword: STRONG };

	it('accepts a valid change', () => {
		expect(changePasswordSchema.safeParse(valid).success).toBe(true);
	});

	it('requires the current password and a 12+ character new one', () => {
		expect(changePasswordSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false);
		expect(
			changePasswordSchema.safeParse({ ...valid, newPassword: 'short', confirmPassword: 'short' })
				.success
		).toBe(false);
	});

	it('flags a mismatch on confirmPassword', () => {
		const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: 'other' });
		expect(result.error?.issues).toEqual([
			expect.objectContaining({ path: ['confirmPassword'], message: "Passwords don't match" })
		]);
	});
});

describe('updateNameSchema', () => {
	it('accepts 1 to 100 characters', () => {
		expect(updateNameSchema.safeParse({ name: 'A' }).success).toBe(true);
		expect(updateNameSchema.safeParse({ name: 'A'.repeat(100) }).success).toBe(true);
	});

	it('rejects empty and over-long names', () => {
		expect(updateNameSchema.safeParse({ name: '' }).success).toBe(false);
		expect(updateNameSchema.safeParse({ name: 'A'.repeat(101) }).success).toBe(false);
	});
});
