import { getAuthenticatorName } from '@better-auth/passkey';
import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	changePasswordSchema,
	removePasskeySchema,
	renamePasskeySchema,
	updateProfileSchema
} from '#lib/formSchemas/index.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { auth } from '#lib/server/auth.js';
import { accountQueries, userQueries } from '#lib/server/db/queries/index.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

interface PasskeyRow {
	id: string;
	/** The user's label, or `null` when they never named it. */
	name: string | null;
	/** The provider from the AAGUID (e.g. "iCloud Keychain"), when known. */
	provider: string | null;
	createdAt: Date | null;
}

// A passkey-list failure only hides that section; name and password still work.
async function loadPasskeys(headers: Headers, userId: string) {
	try {
		const rows = await auth.api.listPasskeys({ headers });
		const passkeys: PasskeyRow[] = rows.map((row) => ({
			id: row.id,
			name: row.name || null,
			provider: getAuthenticatorName(row.aaguid) ?? null,
			createdAt: row.createdAt ? new Date(row.createdAt) : null
		}));
		return { passkeys };
	} catch (err) {
		logger.error('Failed to load passkeys', err, { userId });
		return {
			passkeys: [] as PasskeyRow[],
			passkeysLoadError: 'Failed to load your passkeys. Please try refreshing the page.'
		};
	}
}

export const load: PageServerLoad = async ({ locals, request }) => {
	const currentUser = getUser(locals);
	const passwordForm = await superValidate(zod4(changePasswordSchema));
	const passkeyData = await loadPasskeys(request.headers, currentUser.id);

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
			passwordUpdatedAt: accountData?.updatedAt || null,
			...passkeyData
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
			...passkeyData,
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

// Adding a passkey runs in the browser (WebAuthn); renaming and removing one are plain
// form posts. Better Auth checks the passkey belongs to the signed-in user.
export const actions: Actions = {
	...profileActions,
	renamePasskey: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(renamePasskeySchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() =>
				auth.api.updatePasskey({
					body: { id: form.data.id, name: form.data.name },
					headers: request.headers
				}),
			{
				loggerContext: 'Failed to rename passkey',
				fallbackMessage: 'Could not rename that passkey. Please try again.',
				successMessage: 'Passkey renamed.',
				logFields: { userId: user.id }
			}
		);
	}),
	removePasskey: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(removePasskeySchema));
		if (!form.valid) return invalidForm(form);

		return handleDomainAction(
			form,
			() => auth.api.deletePasskey({ body: { id: form.data.id }, headers: request.headers }),
			{
				loggerContext: 'Failed to remove passkey',
				fallbackMessage: 'Could not remove that passkey. Please try again.',
				successMessage: 'Passkey removed.',
				logFields: { userId: user.id }
			}
		);
	})
};
