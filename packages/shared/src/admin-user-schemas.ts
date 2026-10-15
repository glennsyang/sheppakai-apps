// Form schemas for the admin user-management actions in `admin-user-actions`. Client-safe
// (zod only), so pages can pass them to `zod4Client` too. Every action posts `userId`.
import { z } from 'zod';

/** Roles the admin UI can assign. Mirrors `defaultRole` / `adminRoles` in `auth-config`. */
export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userIdField = z.string().min(1, 'User ID is required');

/** unbanUser, removeUser, sendWelcomeEmail (and any other single-user admin action). */
export const adminUserIdSchema = z.object({
	userId: userIdField
});

export const setRoleSchema = z.object({
	userId: userIdField,
	role: z.enum(USER_ROLES)
});

export const banUserSchema = z.object({
	userId: userIdField,
	banReason: z.string().trim().max(500, 'Reason must be at most 500 characters').optional()
});

/**
 * Admin "Add user" form. No password field: the server generates a throwaway one the admin
 * never sees, and the user sets their own from the welcome email.
 */
export const createUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(100, 'Name must be at most 100 characters'),
	// Normalise before validating: z.email() checks the format before any .trim().
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(254, 'Email must be at most 254 characters')
		.pipe(z.email('Enter a valid email address')),
	role: z.enum(USER_ROLES).default('user')
});
