import { getAuthenticatorName } from '@better-auth/passkey';
import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { isRedirect } from '@sveltejs/kit';
import { message, superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	changePasswordSchema,
	removePasskeySchema,
	renamePasskeySchema,
	updateProfileSchema
} from '#lib/formSchemas/index.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
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

const PASSKEYS_LOAD_ERROR = 'Failed to load your passkeys. Please try refreshing the page.';

/** A passkey-list failure only hides that section; name and password still work. */
async function loadPasskeys(headers: Headers, userId: string) {
	try {
		const rows = await auth.api.listPasskeys({ headers });
		const passkeys: PasskeyRow[] = rows.map((row) => ({
			id: row.id,
			name: row.name || null,
			provider: getAuthenticatorName(row.aaguid) ?? null,
			createdAt: row.createdAt ? new Date(row.createdAt) : null
		}));
		return { passkeys, passkeysLoadError: null };
	} catch (error) {
		logger.error('Failed to load passkeys', error, { userId });
		return { passkeys: [] as PasskeyRow[], passkeysLoadError: PASSKEYS_LOAD_ERROR };
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

/**
 * Runs a Better Auth passkey call for a form action: success → message, redirect →
 * re-thrown, anything else → logged and a 500 message (docs/ERROR_HANDLING_POLICY.md).
 */
async function runPasskeyAction<T extends Record<string, unknown>>(
	form: SuperValidated<T>,
	call: () => Promise<unknown>,
	text: { success: string; error: string; log: string },
	userId: string
) {
	try {
		await call();
		return message(form, { type: 'success', text: text.success });
	} catch (error) {
		if (isRedirect(error)) throw error;
		logger.error(text.log, error, { userId });
		return message(form, { type: 'error', text: text.error }, { status: 500 });
	}
}

// Adding a passkey runs in the browser (WebAuthn); renaming and removing one are plain
// form posts. Better Auth checks the passkey belongs to the signed-in user.
export const actions = {
	...profileActions,
	renamePasskey: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(renamePasskeySchema));
		if (!form.valid) return invalidForm(form);

		return runPasskeyAction(
			form,
			() =>
				auth.api.updatePasskey({
					body: { id: form.data.id, name: form.data.name },
					headers: request.headers
				}),
			{
				success: 'Passkey renamed.',
				error: 'Could not rename that passkey. Please try again.',
				log: 'Failed to rename passkey'
			},
			user.id
		);
	}),
	removePasskey: requireAuth(async ({ request }, user) => {
		const form = await superValidate(request, zod4(removePasskeySchema));
		if (!form.valid) return invalidForm(form);

		return runPasskeyAction(
			form,
			() => auth.api.deletePasskey({ body: { id: form.data.id }, headers: request.headers }),
			{
				success: 'Passkey removed.',
				error: 'Could not remove that passkey. Please try again.',
				log: 'Failed to remove passkey'
			},
			user.id
		);
	})
} satisfies Actions;
