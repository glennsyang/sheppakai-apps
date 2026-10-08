// Shared action/load guards. The admin checks are bound to this app's ADMIN_USER_IDS so an
// admin bootstrapped by id passes them, matching the better-auth admin plugin.
import { ADMIN_USER_IDS } from '$app/env/private';
import { createAdminGuards } from '@sheppakai/shared/auth-guard';

export { getUser, requireAuth } from '@sheppakai/shared/auth-guard';

export const { requireAdmin, assertAdmin } = createAdminGuards(() => ADMIN_USER_IDS);
