// The admin user-management schemas are shared by every app (they back the shared actions
// in @sheppakai/shared/admin-user-actions).
import type { createUserSchema } from '@sheppakai/shared/admin-user-schemas';

export { createUserSchema, USER_ROLES } from '@sheppakai/shared/admin-user-schemas';
export type CreateUserSchema = typeof createUserSchema;
