import { eq } from 'drizzle-orm';

import { getWorkoutNotificationTag } from '#lib/utils/workout.js';

import { user, workoutReminders } from '../db/schema';
import { firesToday, hasTimePassed } from '../notification-jobs/clock';
import type { NotificationJob } from '../notification-jobs/run-job';
import { buildWorkoutReminderEmail } from './templates';

type WorkoutReminderCandidate = {
	reminder: typeof workoutReminders.$inferSelect;
	user: typeof user.$inferSelect;
};

/** Email + push for each enabled Workout Reminder once its time has passed today. */
export const workoutReminderJob: NotificationJob<WorkoutReminderCandidate> = {
	type: 'workout_reminder',
	label: 'workout reminders',
	dedupe: 'pacific-day',
	candidates: ({ db, clock }) =>
		db
			.select({ reminder: workoutReminders, user })
			.from(workoutReminders)
			.innerJoin(user, eq(workoutReminders.userId, user.id))
			.where(eq(workoutReminders.enabled, true))
			.all()
			.filter(
				({ reminder }) =>
					firesToday(clock, reminder.cadence, reminder.daysOfWeek) &&
					hasTimePassed(clock, reminder.time)
			),
	recipient: (candidate) => candidate.user,
	entityId: ({ reminder }) => reminder.id,
	message: ({ reminder, user: owner }) => ({
		logSubject: `Time for your ${reminder.workoutType} workout!`,
		email: buildWorkoutReminderEmail(owner.name, reminder.workoutType, reminder.time),
		push: {
			message: `You scheduled a ${reminder.workoutType} workout for today.`,
			title: 'Workout Reminder',
			tags: getWorkoutNotificationTag(reminder.workoutType)
		}
	})
};
