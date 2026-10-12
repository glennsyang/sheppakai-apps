import { describe, expect, it } from 'vitest';

import { updateDashboardGoalSettingsSchema, updateVisitStatusSettingsSchema } from './auth';

describe('updateDashboardGoalSettingsSchema', () => {
	const validPayload = {
		meditationWeeklyGoal: 2,
		workoutGreenThreshold: 12,
		workoutAmberThreshold: 8
	};

	it('accepts a valid payload', () => {
		expect(() => updateDashboardGoalSettingsSchema.parse(validPayload)).not.toThrow();
	});

	it('rejects a non-positive meditation weekly goal', () => {
		const result = updateDashboardGoalSettingsSchema.safeParse({
			...validPayload,
			meditationWeeklyGoal: 0
		});
		expect(result.success).toBe(false);
	});

	it('rejects a non-positive green threshold', () => {
		const result = updateDashboardGoalSettingsSchema.safeParse({
			...validPayload,
			workoutGreenThreshold: 0
		});
		expect(result.success).toBe(false);
	});

	it('accepts a zero amber threshold', () => {
		const result = updateDashboardGoalSettingsSchema.safeParse({
			...validPayload,
			workoutAmberThreshold: 0
		});
		expect(result.success).toBe(true);
	});

	it('rejects a negative amber threshold', () => {
		const result = updateDashboardGoalSettingsSchema.safeParse({
			...validPayload,
			workoutAmberThreshold: -1
		});
		expect(result.success).toBe(false);
	});

	it('rejects when amber threshold is not less than green threshold', () => {
		const result = updateDashboardGoalSettingsSchema.safeParse({
			...validPayload,
			workoutGreenThreshold: 8,
			workoutAmberThreshold: 8
		});
		expect(result.success).toBe(false);
	});
});

describe('updateVisitStatusSettingsSchema', () => {
	it('accepts increasing thresholds and defaults the unit to days', () => {
		const result = updateVisitStatusSettingsSchema.safeParse({
			recentToOverdueValue: '14',
			overdueToCriticalValue: '30'
		});
		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			thresholdUnit: 'days',
			recentToOverdueValue: 14,
			overdueToCriticalValue: 30
		});
	});

	it('accepts increasing thresholds in months', () => {
		const result = updateVisitStatusSettingsSchema.safeParse({
			thresholdUnit: 'months',
			recentToOverdueValue: 1,
			overdueToCriticalValue: 2
		});
		expect(result.success).toBe(true);
	});

	it('rejects a critical threshold that is not greater than the overdue threshold', () => {
		const result = updateVisitStatusSettingsSchema.safeParse({
			recentToOverdueValue: 30,
			overdueToCriticalValue: 30
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].path).toEqual(['overdueToCriticalValue']);
	});

	it('rejects non-numeric and non-positive values', () => {
		expect(
			updateVisitStatusSettingsSchema.safeParse({
				recentToOverdueValue: 'abc',
				overdueToCriticalValue: 30
			}).success
		).toBe(false);
		expect(
			updateVisitStatusSettingsSchema.safeParse({
				recentToOverdueValue: 0,
				overdueToCriticalValue: 30
			}).success
		).toBe(false);
	});
});
