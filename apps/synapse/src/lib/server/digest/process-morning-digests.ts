import { getThisWeek, getUsualWeekday } from '#lib/server/family-worship/family-worship.js';

import { loadDailyAgendaEntriesForDate } from '../daily-agenda';
import { user } from '../db/schema';
import { loadTasksDueToday } from '../email/digests';
import { loadVisitWarningCandidates } from '../email/visit-warnings';
import { getMorningDigestSettingsByUserIds } from '../morning-digest-settings';
import type { JobClock } from '../notification-jobs/clock';
import type { JobContext, NotificationJob } from '../notification-jobs/run-job';
import {
	buildMorningDigestMessage,
	buildMorningDigestTitle,
	isMorningDigestDue,
	MORNING_DIGEST_NOTIFICATION_TYPE,
	MORNING_DIGEST_TAGS,
	type DigestBill,
	type DigestVisit
} from './morning-digest';
import { fetchBillsDueThisWeek, fetchTonightsDinner } from './remote-sections';

type MorningDigestCandidate = { id: string; email: string; name: string };

type HouseholdSections = {
	dinner: string | null;
	bills: DigestBill[];
	visitCandidates: Awaited<ReturnType<typeof loadVisitWarningCandidates>>;
};

// Keyed by the run's context: fetched on the first digest built in a run, reused for the rest.
const householdSectionsByRun = new WeakMap<JobContext, Promise<HouseholdSections>>();

async function fetchHouseholdSections({ db, clock }: JobContext): Promise<HouseholdSections> {
	const [dinnerResult, billsResult, visitCandidates] = await Promise.all([
		fetchTonightsDinner(clock.today),
		fetchBillsDueThisWeek(clock.today),
		loadVisitWarningCandidates(db, clock.today)
	]);
	return {
		dinner: dinnerResult.ok ? dinnerResult.value : null,
		bills: billsResult.ok ? billsResult.value : [],
		visitCandidates
	};
}

function householdSections(ctx: JobContext): Promise<HouseholdSections> {
	let sections = householdSectionsByRun.get(ctx);
	if (!sections) {
		sections = fetchHouseholdSections(ctx);
		householdSectionsByRun.set(ctx, sections);
	}
	return sections;
}

/** Tonight's Family Worship topic: only on the Usual Weekday, from a planned, unskipped week. */
async function tonightsFamilyWorship(
	db: JobContext['db'],
	userId: string,
	clock: JobClock
): Promise<string | null> {
	if (clock.weekday !== (await getUsualWeekday(db, userId))) return null;
	const week = getThisWeek(db, userId, clock.today);
	return week.skip ? null : (week.plannedTopic?.title ?? null);
}

/**
 * Send each opted-in user one combined push once their send time has passed: agenda,
 * tasks due, tonight's dinner (mealplanner), tonight's Family Worship topic, bills due this week (budget) and overdue
 * visits. Dinner and bills are household-wide, so they are fetched once per run, and only
 * when someone is due; an unreachable app only drops its own section. An empty digest is still logged, so later
 * runs today don't rebuild it.
 */
export const morningDigestJob: NotificationJob<MorningDigestCandidate> = {
	type: MORNING_DIGEST_NOTIFICATION_TYPE,
	label: 'morning digests',
	dedupe: 'pacific-day',
	candidates: async ({ db, clock }) => {
		const allUsers = db
			.select({ id: user.id, email: user.email, name: user.name })
			.from(user)
			.all();
		const settingsByUserId = await getMorningDigestSettingsByUserIds(
			allUsers.map(({ id }) => id),
			db
		);
		return allUsers.filter(({ id }) => {
			const settings = settingsByUserId.get(id);
			return !!settings?.enabled && isMorningDigestDue(clock.hour, clock.minute, settings.sendTime);
		});
	},
	recipient: (candidate) => candidate,
	entityId: (_candidate, { clock }) => clock.today,
	message: async ({ id: userId }, ctx) => {
		const { db, clock } = ctx;
		const { dinner, bills, visitCandidates } = await householdSections(ctx);
		const visits: DigestVisit[] = visitCandidates
			.filter((candidate) => candidate.user.id === userId)
			.map((candidate) => ({
				name: candidate.person.name,
				status: candidate.warningStatus,
				lastVisitDate: candidate.lastVisitDate
			}));

		const title = buildMorningDigestTitle(clock.today);
		const message = buildMorningDigestMessage(
			{
				agenda: await loadDailyAgendaEntriesForDate(
					{ db, userId, today: clock.today },
					clock.today
				),
				tasksDue: await loadTasksDueToday(db, userId, clock.today),
				dinner,
				familyWorship: await tonightsFamilyWorship(db, userId, clock),
				bills,
				visits
			},
			clock.today
		);

		return {
			logSubject: title,
			push: message ? { message, title, tags: MORNING_DIGEST_TAGS } : undefined
		};
	}
};
