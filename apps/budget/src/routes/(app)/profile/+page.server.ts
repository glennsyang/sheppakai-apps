import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { changePasswordSchema, updateProfileSchema } from '#lib/formSchemas/index.js';
import { getUser } from '#lib/server/actions/auth-guard.js';
import { auth } from '#lib/server/auth.js';
import { accountQueries, userQueries } from '#lib/server/db/queries/index.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = getUser(locals);
	const passwordForm = await superValidate(zod4(changePasswordSchema));

	try {
		// The full user row (for updatedAt) and the account row (for when the password last changed).
		const [fullUserData, accountData] = await Promise.all([
			userQueries.findById(currentUser.id),
			accountQueries.findByUserId(currentUser.id)
		]);

		// Initialize profile form with current user data
		const profileForm = await superValidate(
			{ name: fullUserData?.name || '' },
			zod4(updateProfileSchema)
		);

		return {
			user: fullUserData || currentUser,
			profileForm,
			passwordForm,
			passwordUpdatedAt: accountData?.updatedAt || null
		};
	} catch (error) {
		logger.error('Failed to load profile:', error);
		// The session user still carries the name and email the forms need.
		const profileForm = await superValidate(
			{ name: currentUser.name || '' },
			zod4(updateProfileSchema)
		);
		return {
			user: currentUser,
			profileForm,
			passwordForm,
			passwordUpdatedAt: null,
			loadError: 'Failed to load profile details. Please try refreshing the page.'
		};
	}
};

// Change-name and change-password actions, shared by every app.
const profileActions = createProfileActions({
	auth,
	sendPasswordChangedEmail,
	getErrorMessage: getBetterAuthErrorMessage,
	logger
});

export const actions = { ...profileActions } satisfies Actions;
