// Auth form schemas shared by every app, on both client (`zod4Client`) and server. Each
// app's own auth schema module re-exports these alongside its app-only schemas.

import { z } from 'zod';

const PASSWORDS_DONT_MATCH = "Passwords don't match";

// Also enforced server-side for direct /api/auth/* writes (`./name-guard`, same limit).
const MAX_NAME_LENGTH = 100;

/**
 * Canonical password rule for reset/change/set-password: length-only, per NIST SP 800-63B
 * §5.1.1.2 (composition rules deliberately omitted). Matches `minPasswordLength` in
 * `./auth-config`.
 */
export const passwordSchema = z.string().min(12, 'Password must be at least 12 characters');

export const emailField = z.email('Please enter a valid email address');

export const signInSchema = z.object({
	email: emailField,
	password: z.string().min(1, 'Password is required')
});

// Resend-verification and forgot-password both take just an email address.
const emailOnlySchema = z.object({
	email: emailField
});

export const resendVerificationSchema = emailOnlySchema;

export const forgotPasswordSchema = emailOnlySchema;

export const resetPasswordSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: z.string().min(1, 'Please confirm your password'),
		// Carried through the form as a hidden field so the action can consume the
		// token from the reset link; the page also guards on its presence.
		token: z.string().optional()
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: PASSWORDS_DONT_MATCH,
		path: ['confirmPassword']
	});

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Current password is required'),
		newPassword: passwordSchema,
		confirmPassword: z.string().min(1, 'Please confirm your password')
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: PASSWORDS_DONT_MATCH,
		path: ['confirmPassword']
	});

export const updateNameSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`)
});
