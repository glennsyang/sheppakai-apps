import { eq } from 'drizzle-orm';

import { meditationRoutines, meditationSchedules, user } from '../db/schema';
import { firesToday, hasTimePassed } from '../notification-jobs/clock';
import type { NotificationJob } from '../notification-jobs/run-job';
import { buildMeditationReminderEmail } from './templates';

type MeditationReminderCandidate = {
	schedule: typeof meditationSchedules.$inferSelect;
	routine: typeof meditationRoutines.$inferSelect;
	user: typeof user.$inferSelect;
};

/** Email + push for each enabled meditation schedule once its time has passed today. */
export const meditationReminderJob: NotificationJob<MeditationReminderCandidate> = {
	type: 'meditation_reminder',
	label: 'meditation reminders',
	dedupe: 'pacific-day',
	candidates: ({ db, clock }) =>
		db
			.select({ schedule: meditationSchedules, routine: meditationRoutines, user })
			.from(meditationSchedules)
			.innerJoin(meditationRoutines, eq(meditationSchedules.routineId, meditationRoutines.id))
			.innerJoin(user, eq(meditationSchedules.userId, user.id))
			.where(eq(meditationSchedules.enabled, true))
			.all()
			.filter(
				({ schedule }) =>
					firesToday(clock, schedule.cadence, schedule.daysOfWeek) &&
					hasTimePassed(clock, schedule.time)
			),
	recipient: (candidate) => candidate.user,
	entityId: ({ schedule }) => schedule.id,
	message: ({ schedule, routine, user: owner }) => ({
		logSubject: 'Time for your meditation practice',
		email: buildMeditationReminderEmail(owner.name, routine.title, schedule.time),
		push: {
			message: `Meditation reminder: ${routine.title} at ${schedule.time}.`,
			title: 'Meditation Reminder',
			tags: 'lotus_position_man'
		}
	})
};
