import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { changePasswordSchema, updateNameSchema } from '#lib/schemas/auth.js';
import { getUser } from '#lib/server/actions/auth-guard.js';
import { getBetterAuthErrorMessage } from '#lib/server/auth/errors.js';
import { auth } from '#lib/server/auth/index.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = getUser(locals);

	const nameForm = await superValidate({ name: user.name }, zod4(updateNameSchema));
	const passwordForm = await superValidate(zod4(changePasswordSchema));

	return { user, nameForm, passwordForm };
};

// Change-name and change-password actions, shared by every app.
const profileActions = createProfileActions({
	auth,
	sendPasswordChangedEmail,
	getErrorMessage: getBetterAuthErrorMessage,
	logger
});

export const actions: Actions = profileActions;
