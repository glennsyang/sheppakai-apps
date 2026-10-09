import { z } from 'zod';

export const USER_ROLES = ['user', 'admin'] as const;

const userIdField = z.string().min(1, 'User ID is required');

/**
 * Schema for creating a user from Admin → Users. There's no password field: the server
 * generates a throwaway one and the user sets their own via the forgot-password flow.
 */
export const createUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(100, 'Name must be at most 100 characters'),
	email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
	role: z.enum(USER_ROLES).default('user')
});

/**
 * Schema for (re)sending the welcome email to an existing user.
 */
export const sendWelcomeEmailSchema = z.object({
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

export const unbanUserSchema = z.object({
	userId: userIdField
});

/**
 * Removing a user deletes everything they own: every user-scoped table cascades on `user.id`.
 */
export const removeUserSchema = z.object({
	userId: userIdField
});
