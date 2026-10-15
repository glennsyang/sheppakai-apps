import { FLY_APP_NAME } from '$app/env/private';
import {
	ADMIN_USER_LIST_LIMIT,
	createAdminUserActions
} from '@sheppakai/shared/admin-user-actions';
import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	adminUserIdSchema,
	banUserSchema,
	createUserSchema,
	setPasswordSchema,
	setRoleSchema
} from '#lib/formSchemas/index.js';
import { adminFormAction } from '#lib/server/actions/admin-guard.js';
import { assertAdmin, isAdminUser } from '#lib/server/actions/auth-guard.js';
import { apiKeyStore } from '#lib/server/api/api-key-store.js';
import { allowedEmails, auth } from '#lib/server/auth.js';
import { sendWelcome } from '#lib/server/auth/welcome.js';
import { sessionQueries } from '#lib/server/db/queries/index.js';
import { logger } from '#lib/server/logger.js';
import { sendAuthAlerts } from '#lib/server/notifications/index.js';
import type { UserWithSessions } from '#lib/types.js';

import type { Actions, PageServerLoad } from './$types';

// Role, ban, unban, remove, create and welcome-email actions, shared by every app.
const adminUserActions = createAdminUserActions({
	appName: 'Sheppakai Budget',
	auth,
	isAdminUser,
	allowedEmails,
	flyAppName: FLY_APP_NAME,
	sendWelcome,
	sendAuthAlerts,
	logger,
	disableApiKeysForUser: (userId) => apiKeyStore.disableForUser(userId)
});

export const load: PageServerLoad = async ({ request, locals }) => {
	assertAdmin(locals);

	// Initialize all forms with unique IDs
	const setRoleForm = await superValidate(zod4(setRoleSchema), {
		id: 'setUserRole'
	});
	const setPasswordForm = await superValidate(zod4(setPasswordSchema), {
		id: 'setPassword'
	});
	const banUserForm = await superValidate(zod4(banUserSchema), {
		id: 'banUser'
	});
	const createUserForm = await superValidate(zod4(createUserSchema), {
		id: 'createUser'
	});

	try {
		// List all users using better-auth admin API
		const result = await auth.api.listUsers({
			query: {
				limit: ADMIN_USER_LIST_LIMIT,
				sortBy: 'name',
				sortDirection: 'desc'
			},
			// This endpoint requires session cookies.
			headers: request.headers
		});

		if (!result?.users) {
			return {
				usersWithSessions: [],
				loadError: 'Failed to retrieve user list from the auth provider.',
				setRoleForm,
				setPasswordForm,
				banUserForm,
				createUserForm
			};
		}

		// One query for every listed user's sessions, grouped by user below.
		const sessions = await sessionQueries.findSummariesByUserIds(
			result.users.map((user) => user.id)
		);
		const sessionsByUser = Map.groupBy(sessions, (session) => session.userId);

		const usersWithSessions: UserWithSessions[] = result.users.map((user) => ({
			...user,
			sessions: sessionsByUser.get(user.id) ?? []
		}));

		return {
			usersWithSessions,
			setRoleForm,
			setPasswordForm,
			banUserForm,
			createUserForm
		};
	} catch (error) {
		logger.error('Failed to load users:', error);
		return {
			usersWithSessions: [],
			loadError: 'Failed to load users. Please try refreshing the page.',
			setRoleForm,
			setPasswordForm,
			banUserForm,
			createUserForm
		};
	}
};

export const actions = {
	...adminUserActions,

	setPassword: adminFormAction(setPasswordSchema, async ({ request }, form) => {
		try {
			await auth.api.setUserPassword({
				body: {
					userId: form.data.userId,
					newPassword: form.data.newPassword
				},
				headers: request.headers
			});

			logger.info(`Set password successfully`, { userId: form.data.userId });
			return message(form, {
				type: 'success',
				text: 'Password updated successfully'
			});
		} catch (error) {
			logger.error('Failed to set password:', error);
			return message(
				form,
				{
					type: 'error',
					text: getBetterAuthErrorMessage(error, 'Failed to set user password')
				},
				{ status: 500 }
			);
		}
	}),

	revokeSession: adminFormAction(
		adminUserIdSchema,
		async ({ request }, form) => {
			try {
				// Revoke all sessions for the user
				await auth.api.revokeUserSessions({
					body: {
						userId: form.data.userId
					},
					headers: request.headers
				});

				logger.info(`User sessions revoked successfully`, {
					userId: form.data.userId
				});
				return message(form, {
					type: 'success',
					text: 'Sessions revoked successfully'
				});
			} catch (error) {
				logger.error('Failed to revoke sessions:', error);
				return message(form, { type: 'error', text: 'Failed to revoke sessions' }, { status: 500 });
			}
		},
		{ invalidMessage: 'User ID is required' }
	)
} satisfies Actions;
