import { FLY_APP_NAME } from '$app/env/private';
import {
	ADMIN_USER_LIST_LIMIT,
	createAdminUserActions
} from '@sheppakai/shared/admin-user-actions';
import { createUserSchema } from '@sheppakai/shared/admin-user-schemas';
import { isEmailAllowed } from '@sheppakai/shared/auth-allowlist';
import { error } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { assertAdmin, isAdminUser } from '#lib/server/actions/auth-guard.js';
import { allowedEmails, auth } from '#lib/server/auth/index.js';
import { sendWelcome } from '#lib/server/auth/welcome.js';
import { logger } from '#lib/server/logger.js';
import { sendAuthAlerts } from '#lib/server/notifications/index.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request, locals }) => {
	// Server loads run in parallel with the layout's guard, so check here too.
	assertAdmin(locals);

	const createForm = await superValidate(zod4(createUserSchema));
	try {
		const { users } = await auth.api.listUsers({
			query: { limit: ADMIN_USER_LIST_LIMIT, sortBy: 'createdAt', sortDirection: 'desc' },
			headers: request.headers
		});
		const allowlistedIds = users
			.filter((u) => isEmailAllowed(allowedEmails, u.email))
			.map((u) => u.id);
		return { users, allowlistedIds, createForm };
	} catch (err) {
		// The plugin's own admin check here is authoritative; map its 401/403 to a plain
		// 403 in case the layout guard's view of the role is ever out of date.
		if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
			error(403, 'Forbidden');
		}
		logger.error('Failed to load admin user list', err);
		return {
			users: [],
			allowlistedIds: [],
			loadError: 'Failed to load users. Please try refreshing the page.',
			createForm
		};
	}
};

// Role, ban, unban, remove, create and welcome-email actions, shared by every app. Shared
// household rows (pantry, recipes, plans) survive a removed user: their creator `user_id`
// FK is ON DELETE SET NULL, so only auth data goes with the user (#164).
export const actions: Actions = createAdminUserActions({
	appName: 'Meal Planner',
	auth,
	isAdminUser,
	allowedEmails,
	flyAppName: FLY_APP_NAME,
	sendWelcome,
	sendAuthAlerts,
	logger
});
