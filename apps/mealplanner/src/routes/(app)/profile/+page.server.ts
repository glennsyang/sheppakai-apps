import { getAuthenticatorName } from '@better-auth/passkey';
import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { changePasswordSchema, updateNameSchema } from '#lib/schemas/auth.js';
import { removePasskeySchema, renamePasskeySchema } from '#lib/schemas/passkeys.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { handleDomainAction } from '#lib/server/actions/domain-action.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { auth } from '#lib/server/auth/index.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';

import type { Actions, PageServerLoad } from './$types';

export interface PasskeyRow {
	id: string;
	/** The user's label, or `null` when they never named it. */
	name: string | null;
	/** The provider from the AAGUID (e.g. "iCloud Keychain"), when known. */
	provider: string | null;
	createdAt: Date | null;
}

export const load: PageServerLoad = async ({ locals, request }) => {
	const user = getUser(locals);

	const nameForm = await superValidate({ name: user.name }, zod4(updateNameSchema));
	const passwordForm = await superValidate(zod4(changePasswordSchema));

	// A passkey-list failure only hides that section; name and password still work.
	try {
		const rows = await auth.api.listPasskeys({ headers: request.headers });
		const passkeys: PasskeyRow[] = rows.map((row) => ({
			id: row.id,
			name: row.name || null,
			provider: getAuthenticatorName(row.aaguid) ?? null,
			createdAt: row.createdAt ? new Date(row.createdAt) : null
		}));
		return { user, nameForm, passwordForm, passkeys };
	} catch (err) {
		logger.error('Failed to load passkeys', err, { userId: user.id });
		return {
			user,
			nameForm,
			passwordForm,
			passkeys: [] as PasskeyRow[],
			passkeysLoadError: 'Failed to load your passkeys. Please try refreshing the page.'
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
