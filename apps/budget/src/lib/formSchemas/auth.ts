import { passwordSchema, updateNameSchema } from '@sheppakai/shared/auth-schemas';
import { z } from 'zod';

export {
	changePasswordSchema,
	passwordSchema,
	resendVerificationSchema,
	signInSchema
} from '@sheppakai/shared/auth-schemas';

export const updateProfileSchema = updateNameSchema;

export const setUserRoleSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.string().min(4, 'Role is required').max(5, 'Role must be either user or admin')
});

// No password field: the server generates a throwaway one and the user sets their own
// from the welcome email's set-password link.
export const createUserSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(100, 'Name must be at most 100 characters'),
	email: z.email('Please enter a valid email address'),
	role: z.enum(['user', 'admin']).default('user')
});

export const setPasswordSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	newPassword: passwordSchema
});

export const banUserSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	banReason: z.string().max(500, 'Ban reason must be at most 500 characters')
});

// The admin actions driven by ConfirmModal (unban, revoke sessions, delete) post a single
// `id` field. They validate against this so their failures can carry a message, per
// docs/ERROR_HANDLING_POLICY.md.
export const userIdSchema = z.object({
	id: z.string().min(1, 'User ID is required')
});
