import { getAuthenticatorName } from '@better-auth/passkey';
import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	changePasswordSchema,
	updateDashboardGoalSettingsSchema,
	updateMorningDigestSettingsSchema,
	updateProfileSchema,
	updateVisitStatusSettingsSchema
} from '#lib/schemas/auth.js';
import { removePasskeySchema, renamePasskeySchema } from '#lib/schemas/passkeys.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { invalidForm } from '#lib/server/actions/form-responses.js';
import { auth } from '#lib/server/auth.js';
import { getDashboardGoalsForUser } from '#lib/server/dashboard-goal-settings.js';
import { getDb } from '#lib/server/db/index.js';
import {
	account,
	dashboardGoalSettings,
	morningDigestSettings,
	user,
	visitStatusSettings
} from '#lib/server/db/schema/index.js';
import { upsertUserSettings } from '#lib/server/db/writes/user-settings.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';
import {
	DEFAULT_MORNING_DIGEST_SETTINGS,
	getMorningDigestSettingsForUser
} from '#lib/server/morning-digest-settings.js';
import { getVisitStatusThresholdsForUser } from '#lib/server/visit-status-settings.js';
import { DEFAULT_DASHBOARD_GOALS, normalizeDashboardGoals } from '#lib/utils/dashboard-goals.js';
import {
	convertVisitThresholdToDays,
	DEFAULT_VISIT_STATUS_THRESHOLDS,
	normalizeVisitStatusThresholds
} from '#lib/utils/visit-status.js';

import type { Actions, PageServerLoad } from './$types';

interface PasskeyRow {
	id: string;
	/** The user's label, or `null` when they never named it. */
	name: string | null;
	/** The provider from the AAGUID (e.g. "iCloud Keychain"), when known. */
	provider: string | null;
	createdAt: Date | null;
}

// A passkey-list failure only hides that section; the rest of Profile still works.
async function loadPasskeys(
	headers: Headers,
	userId: string
): Promise<{ passkeys: PasskeyRow[]; passkeysLoadError?: string }> {
	try {
		const rows = await auth.api.listPasskeys({ headers });
		return {
			passkeys: rows.map((row) => ({
				id: row.id,
				name: row.name || null,
				provider: getAuthenticatorName(row.aaguid) ?? null,
				createdAt: row.createdAt ? new Date(row.createdAt) : null
			}))
		};
	} catch (err) {
		logger.error('Failed to load passkeys', err, { userId });
		return {
			passkeys: [],
			passkeysLoadError: 'Failed to load your passkeys. Please try refreshing the page.'
		};
	}
}

export const load: PageServerLoad = async ({ locals, request }) => {
	const userId = getUser(locals).id;
	const passkeyData = await loadPasskeys(request.headers, userId);

	try {
		const db = getDb();
		const [fullUserData, accountData, visitThresholds, dashboardGoals, morningDigest] =
			await Promise.all([
				db.query.user.findFirst({ where: eq(user.id, userId) }),
				db.query.account.findFirst({ where: eq(account.userId, userId) }),
				getVisitStatusThresholdsForUser(userId, db),
				getDashboardGoalsForUser(userId, db),
				getMorningDigestSettingsForUser(userId, db)
			]);

		// Initialize profile form with current user data
		const profileForm = await superValidate(
			{ name: fullUserData?.name || '' },
			zod4(updateProfileSchema)
		);
		const passwordForm = await superValidate(zod4(changePasswordSchema));
		const visitSettingsForm = await superValidate(
			{
				thresholdUnit: 'days',
				recentToOverdueValue: visitThresholds.recentToOverdueDays,
				overdueToCriticalValue: visitThresholds.overdueToCriticalDays
			},
			zod4(updateVisitStatusSettingsSchema)
		);
		const dashboardGoalSettingsForm = await superValidate(
			dashboardGoals,
			zod4(updateDashboardGoalSettingsSchema)
		);
		const morningDigestForm = await superValidate(
			morningDigest,
			zod4(updateMorningDigestSettingsSchema)
		);

		return {
			user: fullUserData || locals.user,
			profileForm,
			passwordForm,
			visitSettingsForm,
			visitThresholds,
			dashboardGoalSettingsForm,
			dashboardGoals,
			morningDigestForm,
			morningDigest,
			passwordUpdatedAt: accountData?.updatedAt || null,
			...passkeyData
		};
	} catch (err) {
		logger.error('Failed to load profile data', err, { userId });

		return {
			user: locals.user,
			profileForm: await superValidate(zod4(updateProfileSchema)),
			passwordForm: await superValidate(zod4(changePasswordSchema)),
			visitSettingsForm: await superValidate(zod4(updateVisitStatusSettingsSchema)),
			visitThresholds: DEFAULT_VISIT_STATUS_THRESHOLDS,
			dashboardGoalSettingsForm: await superValidate(zod4(updateDashboardGoalSettingsSchema)),
			dashboardGoals: DEFAULT_DASHBOARD_GOALS,
			morningDigestForm: await superValidate(zod4(updateMorningDigestSettingsSchema)),
			morningDigest: DEFAULT_MORNING_DIGEST_SETTINGS,
			passwordUpdatedAt: null,
			...passkeyData,
			loadError: 'Failed to load profile data. Please try refreshing the page.'
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
export const actions = {
	...profileActions,

	renamePasskey: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(renamePasskeySchema));
		if (!form.valid) return invalidForm(form);

		try {
			await auth.api.updatePasskey({
				body: { id: form.data.id, name: form.data.name },
				headers: request.headers
			});
			return message(form, { type: 'success', text: 'Passkey renamed.' });
		} catch (error) {
			logger.error('Failed to rename passkey', error, { userId: currentUser.id });
			return message(
				form,
				{ type: 'error', text: 'Could not rename that passkey. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	removePasskey: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(removePasskeySchema));
		if (!form.valid) return invalidForm(form);

		try {
			await auth.api.deletePasskey({ body: { id: form.data.id }, headers: request.headers });
			return message(form, { type: 'success', text: 'Passkey removed.' });
		} catch (error) {
			logger.error('Failed to remove passkey', error, { userId: currentUser.id });
			return message(
				form,
				{ type: 'error', text: 'Could not remove that passkey. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	updateVisitSettings: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(updateVisitStatusSettingsSchema));

		if (!form.valid) return invalidForm(form);

		try {
			const rawRecentDays = convertVisitThresholdToDays(
				form.data.recentToOverdueValue,
				form.data.thresholdUnit
			);
			const rawCriticalDays = convertVisitThresholdToDays(
				form.data.overdueToCriticalValue,
				form.data.thresholdUnit
			);

			const normalizedThresholds = normalizeVisitStatusThresholds({
				recentToOverdueDays: rawRecentDays,
				overdueToCriticalDays: rawCriticalDays
			});

			await upsertUserSettings(visitStatusSettings, currentUser.id, {
				recentToOverdueDays: normalizedThresholds.recentToOverdueDays,
				overdueToCriticalDays: normalizedThresholds.overdueToCriticalDays
			});

			logger.info('Visit status settings updated', {
				userId: currentUser.id,
				recentToOverdueDays: normalizedThresholds.recentToOverdueDays,
				overdueToCriticalDays: normalizedThresholds.overdueToCriticalDays
			});

			return message(form, {
				type: 'success',
				text: 'Visit settings updated successfully.'
			});
		} catch (error) {
			logger.error('Failed to update visit settings', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update visit settings. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	updateDashboardGoalSettings: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(updateDashboardGoalSettingsSchema));

		if (!form.valid) return invalidForm(form);

		try {
			const normalizedGoals = normalizeDashboardGoals(form.data);

			await upsertUserSettings(dashboardGoalSettings, currentUser.id, normalizedGoals);

			logger.info('Dashboard goal settings updated', {
				userId: currentUser.id,
				...normalizedGoals
			});

			return message(form, {
				type: 'success',
				text: 'Dashboard goals updated successfully.'
			});
		} catch (error) {
			logger.error('Failed to update dashboard goal settings', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update dashboard goals. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	updateMorningDigestSettings: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(updateMorningDigestSettingsSchema));

		if (!form.valid) return invalidForm(form);

		try {
			await upsertUserSettings(morningDigestSettings, currentUser.id, form.data);

			logger.info('Morning digest settings updated', {
				userId: currentUser.id,
				...form.data
			});

			return message(form, {
				type: 'success',
				text: 'Morning digest settings updated successfully.'
			});
		} catch (error) {
			logger.error('Failed to update morning digest settings', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update morning digest settings. Please try again.' },
				{ status: 500 }
			);
		}
	})
} satisfies Actions;
