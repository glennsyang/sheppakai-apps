import { updateNameSchema } from '@sheppakai/shared/auth-schemas';
import { z } from 'zod';

import { convertVisitThresholdToDays } from '#lib/utils/visit-status.js';

export { changePasswordSchema } from '@sheppakai/shared/auth-schemas';

export const updateProfileSchema = updateNameSchema;

const visitSettingsUnitSchema = z.enum(['days', 'months']);

export const updateVisitStatusSettingsSchema = z
	.object({
		thresholdUnit: visitSettingsUnitSchema.default('days'),
		recentToOverdueValue: z.coerce
			.number()
			.refine((value) => Number.isFinite(value), 'Please enter a valid number')
			.positive('Value must be greater than 0'),
		overdueToCriticalValue: z.coerce
			.number()
			.refine((value) => Number.isFinite(value), 'Please enter a valid number')
			.positive('Value must be greater than 0')
	})
	.refine(
		(data) => {
			const recentToOverdueDays = convertVisitThresholdToDays(
				data.recentToOverdueValue,
				data.thresholdUnit
			);
			const overdueToCriticalDays = convertVisitThresholdToDays(
				data.overdueToCriticalValue,
				data.thresholdUnit
			);

			return overdueToCriticalDays > recentToOverdueDays;
		},
		{
			path: ['overdueToCriticalValue'],
			message: 'Overdue to critical threshold must be greater than recent to overdue threshold'
		}
	);

export const updateDashboardGoalSettingsSchema = z
	.object({
		meditationWeeklyGoal: z.coerce
			.number()
			.int('Must be a whole number')
			.positive('Value must be greater than 0'),
		workoutGreenThreshold: z.coerce
			.number()
			.int('Must be a whole number')
			.positive('Value must be greater than 0'),
		workoutAmberThreshold: z.coerce
			.number()
			.int('Must be a whole number')
			.nonnegative('Value must be 0 or greater')
	})
	.refine((data) => data.workoutGreenThreshold > data.workoutAmberThreshold, {
		path: ['workoutAmberThreshold'],
		message: 'Amber threshold must be less than the green threshold'
	});
