import { logger } from '#lib/server/logger.js';
import { getCurrentTimeString, getISODayOfWeek, getTodayString } from '#lib/utils/date.js';

/**
 * One reading of the clock, in Pacific time, shared by every job in a run. Jobs read the time
 * from here and never call `new Date()` themselves.
 */
export type JobClock = {
	now: Date;
	/** YYYY-MM-DD */
	today: string;
	/** HH (24-hour) */
	hour: string;
	/** mm */
	minute: string;
	/** 0 = Sunday, 6 = Saturday */
	weekday: number;
};

export function createJobClock(now: Date): JobClock {
	const today = getTodayString(now);
	const [hour, minute] = getCurrentTimeString(now).split(':');
	return { now, today, hour, minute, weekday: (getISODayOfWeek(today) + 1) % 7 };
}

function toMinutes(hour: string, minute: string | undefined): number {
	return Number.parseInt(hour, 10) * 60 + Number.parseInt(minute || '0', 10);
}

/**
 * True once `time` (HH:mm) has passed today. Uses ">=" rather than a fixed window because
 * GitHub Actions cron runs can be delayed well past their slot; dedupe stops repeats.
 */
export function hasTimePassed(clock: JobClock, time: string): boolean {
	const [hour, minute] = time.split(':');
	return toMinutes(clock.hour, clock.minute) >= toMinutes(hour, minute);
}

/** Whether a reminder with this cadence fires on the clock's weekday. */
export function firesToday(clock: JobClock, cadence: string, daysOfWeek: string | null): boolean {
	if (cadence === 'daily') {
		return true;
	}
	if (cadence === 'weekly' && daysOfWeek) {
		try {
			const days: number[] = JSON.parse(daysOfWeek);
			return days.includes(clock.weekday);
		} catch (e) {
			logger.error('❌ Error parsing days_of_week:', e);
			return false;
		}
	}
	return false;
}
