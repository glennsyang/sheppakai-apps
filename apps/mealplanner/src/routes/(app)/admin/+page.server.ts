import { FLY_APP_NAME } from '$app/env/private';
import { createAdminUserActions, listAdminUsers } from '@sheppakai/shared/admin-user-actions';
import { createUserSchema } from '@sheppakai/shared/admin-user-schemas';
import { isEmailAllowed } from '@sheppakai/shared/auth-allowlist';
import { isHttpError } from '@sveltejs/kit';
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
		const users = await listAdminUsers(auth, request.headers, {
			sortBy: 'createdAt',
			sortDirection: 'desc'
		});
		const allowlistedIds = users
			.filter((u) => isEmailAllowed(allowedEmails, u.email))
			.map((u) => u.id);
		return { users, allowlistedIds, createForm };
	} catch (err) {
		// listAdminUsers maps the plugin's 401/403 to a 403.
		if (isHttpError(err)) throw err;
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
