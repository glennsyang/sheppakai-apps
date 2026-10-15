import { passwordSchema, updateNameSchema } from '@sheppakai/shared/auth-schemas';
import { z } from 'zod';

export {
	changePasswordSchema,
	passwordSchema,
	resendVerificationSchema,
	signInSchema
} from '@sheppakai/shared/auth-schemas';

// Admin user-management schemas, shared with the other apps' admin pages.
export {
	adminUserIdSchema,
	banUserSchema,
	createUserSchema,
	setRoleSchema
} from '@sheppakai/shared/admin-user-schemas';

export const updateProfileSchema = updateNameSchema;

export const setPasswordSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	newPassword: passwordSchema
});
