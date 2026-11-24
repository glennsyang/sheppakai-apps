import { addDaysToDateString, getTodayString } from '#lib/utils/date.js';
import { calculatePersonVisitStatus, type VisitStatusThresholds } from '#lib/utils/visit-status.js';

type VisitWarningStatus = 'yellow' | 'critical';

const visitWarningDateFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: 'UTC',
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});

export function getVisitWarningStatus(
	lastVisitDate: string,
	nextVisitDate: string | null = null,
	visitStatusThresholds?: Partial<VisitStatusThresholds> | null,
	today: string = getTodayString()
): VisitWarningStatus | null {
	const { status } = calculatePersonVisitStatus(
		lastVisitDate,
		false,
		nextVisitDate,
		today,
		visitStatusThresholds
	);

	if (status === 'yellow') {
		return 'yellow';
	}

	if (status === 'red') {
		return 'critical';
	}

	return null;
}

const VISIT_WARNING_RESEND_DAYS = 7;

/**
 * True when a warning sent at `sentAt` falls within the last 7 Pacific days
 * (today and the 6 days before it), so it should not be sent again yet.
 */
export function wasVisitWarningSentRecently(sentAt: Date, now: Date = new Date()): boolean {
	const cutoff = addDaysToDateString(getTodayString(now), -VISIT_WARNING_RESEND_DAYS);
	return getTodayString(sentAt) > cutoff;
}

export function formatVisitWarningDate(lastVisitDate: string): string {
	const [year, month, day] = lastVisitDate.split('T')[0].split('-').map(Number);
	return visitWarningDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function buildVisitWarningEntityId(
	personId: string,
	warningStatus: VisitWarningStatus
): string {
	return `${personId}:${warningStatus}`;
}

export function buildVisitWarningSubject(
	personName: string,
	warningStatus: VisitWarningStatus
): string {
	if (warningStatus === 'critical') {
		return `Status: Critical Warning for ${personName}`;
	}

	return `Status: Yellow Warning for ${personName}`;
}
