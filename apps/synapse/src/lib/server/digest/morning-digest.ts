import type { DailyAgendaEntry } from '#lib/types.js';
import { addDaysToDateString, formatDateMedium, formatMonthDay } from '#lib/utils/date.js';

import { getDailyMotivationPhrase, isWithinDailyDigestWindow } from '../email/daily-agenda-digest';
import type { TasksDueTodayTaskSummary } from '../email/tasks-due-today-digest';
import { formatVisitWarningDate } from '../email/visit-warning-utils';

export const MORNING_DIGEST_NOTIFICATION_TYPE = 'morning_digest';
export const MORNING_DIGEST_TAGS = 'sunrise';
export const DEFAULT_MORNING_DIGEST_TIME = '06:00';

const MINUTES_PER_DAY = 24 * 60;

/** Days in the "due this week" bill window, today included. */
const BILL_WINDOW_DAYS = 7;

/** A budget recurring expense, as the digest reads it from budget's /api/v1/recurring. */
export type DigestRecurring = {
	merchant: string;
	description: string;
	cadence: 'Monthly' | 'Yearly';
	amount: number;
	paid: boolean;
	dueDay: number | null;
	dueMonth: number | null;
};

export type DigestBill = {
	merchant: string;
	amount: number;
	dueDate: string;
};

export type DigestVisit = {
	name: string;
	status: 'yellow' | 'critical';
	lastVisitDate: string;
};

export type MorningDigestSections = {
	agenda: DailyAgendaEntry[];
	tasksDue: TasksDueTodayTaskSummary[];
	/** Tonight's recipe name, or null when nothing is planned or mealplanner was unreachable. */
	dinner: string | null;
	bills: DigestBill[];
	visits: DigestVisit[];
};

function toIsoDate(year: number, month: number, day: number): string {
	const lastDay = new Date(year, month, 0).getDate();
	const clampedDay = Math.min(day, lastDay);
	return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/** Due dates a bill could land on near `today`: this and next month (or year), short months clamped. */
function candidateDueDates(bill: DigestRecurring, today: string): string[] {
	if (bill.dueDay === null) return [];
	const [year, month] = today.split('-').map(Number);

	if (bill.cadence === 'Yearly') {
		if (bill.dueMonth === null) return [];
		return [
			toIsoDate(year, bill.dueMonth, bill.dueDay),
			toIsoDate(year + 1, bill.dueMonth, bill.dueDay)
		];
	}

	const nextMonthYear = month === 12 ? year + 1 : year;
	const nextMonth = month === 12 ? 1 : month + 1;
	return [toIsoDate(year, month, bill.dueDay), toIsoDate(nextMonthYear, nextMonth, bill.dueDay)];
}

/** Unpaid bills due from today through the next six days, soonest first. */
export function selectBillsDueThisWeek(recurrings: DigestRecurring[], today: string): DigestBill[] {
	const windowEnd = addDaysToDateString(today, BILL_WINDOW_DAYS - 1);

	return recurrings
		.filter((bill) => !bill.paid)
		.flatMap((bill) => {
			const dueDate = candidateDueDates(bill, today).find(
				(date) => date >= today && date <= windowEnd
			);
			return dueDate ? [{ merchant: bill.merchant, amount: bill.amount, dueDate }] : [];
		})
		.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.merchant.localeCompare(b.merchant));
}

/** Due any time from the send time to the end of the Pacific day, so a late cron run still sends. */
export function isMorningDigestDue(
	currentHour: string,
	currentMinute: string,
	sendTime: string
): boolean {
	return isWithinDailyDigestWindow(currentHour, currentMinute, sendTime, MINUTES_PER_DAY);
}

/** Plain ASCII: ntfy takes the title as an HTTP header, which rejects characters like an en dash. */
export function buildMorningDigestTitle(dateString: string): string {
	return `Morning Digest - ${formatDateMedium(dateString)}`;
}

function formatAmount(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

function formatBillLine(bill: DigestBill, today: string): string {
	const when = bill.dueDate === today ? 'today' : formatMonthDay(bill.dueDate);
	return `• ${bill.merchant} ${formatAmount(bill.amount)} — ${when}`;
}

function formatVisitLine(visit: DigestVisit): string {
	const statusEmoji = visit.status === 'critical' ? '🔴' : '🟡';
	return `${statusEmoji} ${visit.name} — last visit ${formatVisitWarningDate(visit.lastVisitDate)}`;
}

/**
 * The combined morning push body. Each section appears only when it has something in it;
 * returns null when every section is empty, so nothing is sent.
 */
export function buildMorningDigestMessage(
	sections: MorningDigestSections,
	dateString: string
): string | null {
	const blocks: string[] = [];

	if (sections.agenda.length > 0) {
		const lines = sections.agenda.map((entry) => `${entry.completed ? '✅' : '⚪'} ${entry.title}`);
		blocks.push(`🗓️ Agenda\n${lines.join('\n')}`);
	}

	if (sections.tasksDue.length > 0) {
		const lines = sections.tasksDue.map((task) => `• ${task.title}`);
		blocks.push(`🗂️ Tasks due today\n${lines.join('\n')}`);
	}

	if (sections.dinner) {
		blocks.push(`🍽️ Dinner tonight\n${sections.dinner}`);
	}

	if (sections.bills.length > 0) {
		const lines = sections.bills.map((bill) => formatBillLine(bill, dateString));
		blocks.push(`💸 Bills due this week\n${lines.join('\n')}`);
	}

	if (sections.visits.length > 0) {
		blocks.push(`👥 Visits overdue\n${sections.visits.map(formatVisitLine).join('\n')}`);
	}

	if (blocks.length === 0) return null;

	return `${blocks.join('\n\n')}\n\n🚀 ${getDailyMotivationPhrase(dateString)}`;
}
