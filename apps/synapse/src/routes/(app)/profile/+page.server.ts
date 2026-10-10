import {
	changePasswordSchema,
	updateDashboardGoalSettingsSchema,
	updateProfileSchema,
	updateVisitStatusSettingsSchema
} from '$lib/schemas/auth';
import { getUser, requireAuth } from '$lib/server/actions/auth-guard';
import { auth } from '$lib/server/auth';
import { getDashboardGoalsForUser } from '$lib/server/dashboard-goal-settings';
import { getDb } from '$lib/server/db';
import { account, dashboardGoalSettings, user, visitStatusSettings } from '$lib/server/db/schema';
import { generateId, withTimestampsForCreate, withTimestampsForUpdate } from '$lib/server/db/utils';
import { sendPasswordChangedEmail } from '$lib/server/email';
import { logger } from '$lib/server/logger';
import { createUserRateLimiter, rateLimitedMessage } from '$lib/server/rate-limiter';
import { getVisitStatusThresholdsForUser } from '$lib/server/visit-status-settings';
import { getBetterAuthErrorMessage } from '$lib/utils/auth';
import { DEFAULT_DASHBOARD_GOALS, normalizeDashboardGoals } from '$lib/utils/dashboard-goals';
import {
	convertVisitThresholdToDays,
	DEFAULT_VISIT_STATUS_THRESHOLDS,
	normalizeVisitStatusThresholds
} from '$lib/utils/visit-status';
import { eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import type { Actions, PageServerLoad } from './$types';

// Keyed by user id (not IP): this is an authenticated action, and the current-password
// check is the thing worth rate limiting against brute-forcing.
const changePasswordLimiter = createUserRateLimiter([5, 'm']);

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

export const actions = {
	update: requireAuth(async ({ request }, currentUser) => {
		const form = await superValidate(request, zod4(updateProfileSchema));
		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please correct the errors in the form.' },
				{ status: 400 }
			);
		}

		try {
			await getDb().update(user).set({ name: form.data.name }).where(eq(user.id, currentUser.id));

			logger.info('User profile updated successfully', {
				userId: currentUser.id,
				name: form.data.name
			});
			return message(form, { type: 'success', text: 'Profile updated successfully.' });
		} catch (error) {
			logger.error('Failed to update user profile', error);
			return message(
				form,
				{ type: 'error', text: 'Failed to update profile. Please try again.' },
				{ status: 500 }
			);
		}
	}),

	changePassword: requireAuth(async (event, currentUser) => {
		const { request } = event;
		const form = await superValidate(request, zod4(changePasswordSchema));
		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please correct the errors in the form.' },
				{ status: 400 }
			);
		}

		const rateLimitStatus = await changePasswordLimiter.check(event, { userId: currentUser.id });
		if (rateLimitStatus.limited) {
			return rateLimitedMessage(form, rateLimitStatus.retryAfter);
		}

		try {
			// Not X-Forwarded-For: its first entry is client-supplied. getClientAddress()
			// reads the proxy-set Fly-Client-IP (ADDRESS_HEADER in fly.toml).
			let ipAddress: string | undefined;
			try {
				ipAddress = event.getClientAddress() || undefined;
			} catch {
				ipAddress = undefined;
			}
			const userAgent = request.headers.get('user-agent') || undefined;

			await auth.api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					revokeOtherSessions: true
				},
				headers: request.headers
			});

			logger.info('Security event: password changed and other sessions revoked', {
				userId: currentUser.id,
				ipAddress,
				userAgent
			});

			void sendPasswordChangedEmail({
				to: currentUser.email,
				name: currentUser.name || currentUser.email,
				changedAt: new Date(),
				ipAddress,
				userAgent,
				source: 'Profile settings'
			}).catch((err: unknown) => logger.error('Password changed email failed', err));

			return message(form, {
				type: 'success',
				text: `Password changed successfully for user ${currentUser.name}.`
			});
		} catch (error) {
			logger.error('Failed to change password', error);
			return message(
				form,
				{
					type: 'error',
					text: getBetterAuthErrorMessage(
						error,
						'Current password is incorrect or password change failed.'
					)
				},
				{ status: 400 }
			);
		}
	}),

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
			const db = getDb();
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

			const existing = await db.query.visitStatusSettings.findFirst({
				where: eq(visitStatusSettings.userId, currentUser.id)
			});

			if (existing) {
				await db
					.update(visitStatusSettings)
					.set({
						recentToOverdueDays: normalizedThresholds.recentToOverdueDays,
						overdueToCriticalDays: normalizedThresholds.overdueToCriticalDays,
						...withTimestampsForUpdate()
					})
					.where(eq(visitStatusSettings.userId, currentUser.id));
			} else {
				await db.insert(visitStatusSettings).values({
					id: generateId(),
					userId: currentUser.id,
					recentToOverdueDays: normalizedThresholds.recentToOverdueDays,
					overdueToCriticalDays: normalizedThresholds.overdueToCriticalDays,
					...withTimestampsForCreate()
				});
			}

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
			const db = getDb();
			const normalizedGoals = normalizeDashboardGoals(form.data);

			const existing = await db.query.dashboardGoalSettings.findFirst({
				where: eq(dashboardGoalSettings.userId, currentUser.id)
			});

			if (existing) {
				await db
					.update(dashboardGoalSettings)
					.set({
						...normalizedGoals,
						...withTimestampsForUpdate()
					})
					.where(eq(dashboardGoalSettings.userId, currentUser.id));
			} else {
				await db.insert(dashboardGoalSettings).values({
					id: generateId(),
					userId: currentUser.id,
					...normalizedGoals,
					...withTimestampsForCreate()
				});
			}

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
