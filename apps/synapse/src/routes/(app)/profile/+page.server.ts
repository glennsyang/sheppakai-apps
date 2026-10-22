import { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
import { createProfileActions } from '@sheppakai/shared/profile-actions';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import {
	changePasswordSchema,
	updateDashboardGoalSettingsSchema,
	updateProfileSchema,
	updateVisitStatusSettingsSchema
} from '#lib/schemas/auth.js';
import { getUser, requireAuth } from '#lib/server/actions/auth-guard.js';
import { auth } from '#lib/server/auth.js';
import { getDashboardGoalsForUser } from '#lib/server/dashboard-goal-settings.js';
import { getDb } from '#lib/server/db/index.js';
import {
	account,
	dashboardGoalSettings,
	user,
	visitStatusSettings
} from '#lib/server/db/schema/index.js';
import { upsertUserSettings } from '#lib/server/db/writes/user-settings.js';
import { sendPasswordChangedEmail } from '#lib/server/email/index.js';
import { logger } from '#lib/server/logger.js';
import { getVisitStatusThresholdsForUser } from '#lib/server/visit-status-settings.js';
import { DEFAULT_DASHBOARD_GOALS, normalizeDashboardGoals } from '#lib/utils/dashboard-goals.js';
import {
	convertVisitThresholdToDays,
	DEFAULT_VISIT_STATUS_THRESHOLDS,
	normalizeVisitStatusThresholds
} from '#lib/utils/visit-status.js';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = getUser(locals).id;

	try {
		const db = getDb();
		const [fullUserData, accountData, visitThresholds, dashboardGoals] = await Promise.all([
			db.query.user.findFirst({ where: eq(user.id, userId) }),
			db.query.account.findFirst({ where: eq(account.userId, userId) }),
			getVisitStatusThresholdsForUser(userId, db),
			getDashboardGoalsForUser(userId, db)
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

		return {
			user: fullUserData || locals.user,
			profileForm,
			passwordForm,
			visitSettingsForm,
			visitThresholds,
			dashboardGoalSettingsForm,
			dashboardGoals,
			passwordUpdatedAt: accountData?.updatedAt || null
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
			passwordUpdatedAt: null,
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

export const actions = {
	...profileActions,

	updateVisitSettings: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(updateVisitStatusSettingsSchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please correct the errors in the form.' },
				{ status: 400 }
			);
		}

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

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please correct the errors in the form.' },
				{ status: 400 }
			);
		}

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
	})
} satisfies Actions;
