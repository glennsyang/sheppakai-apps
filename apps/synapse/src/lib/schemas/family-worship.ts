import { z } from 'zod';

/** Wednesday: the Usual Weekday for a user who hasn't set one (0 = Sunday … 6 = Saturday). */
export const DEFAULT_USUAL_WEEKDAY = 3;

export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

export type PublicationLink = { label?: string; url: string };

/** A topic as the Family Worship page shows and edits it. */
export type TopicEntry = {
	id: string;
	title: string;
	description: string;
	notes: string | null;
	scriptureReferences: string | null;
	publicationLinks: PublicationLink[];
};

const optionalText = (max: number) => z.string().trim().max(max, 'Too long').default('');

const publicationLinkSchema = z.object({
	label: z.string().trim().max(200, 'Label is too long').default(''),
	url: z.url({ protocol: /^https?$/, message: 'Enter a valid web link (https://…)' })
});

/** The topic form: create and edit share it; edit also posts the topic `id`. */
export const topicSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
	description: z
		.string()
		.trim()
		.min(1, 'Description is required')
		.max(2000, 'Description is too long'),
	notes: optionalText(5000),
	scriptureReferences: optionalText(1000),
	publicationLinks: z.array(publicationLinkSchema).max(20, 'Up to 20 links').default([])
});

export const updateTopicSchema = topicSchema.extend({
	id: z.string().trim().min(1, 'ID is required')
});

/** The Topic Queue after a drag: every active topic id, front first, comma-separated. */
export const topicQueueOrderSchema = z.object({
	topicIds: z
		.string()
		.transform((value) => value.split(',').filter((id) => id.length > 0))
		.pipe(z.array(z.string()).min(1, 'The queue order is empty'))
});

export const usualWeekdaySchema = z.object({
	usualWeekday: z.coerce
		.number()
		.int('Choose a day of the week')
		.min(0, 'Choose a day of the week')
		.max(6, 'Choose a day of the week')
		.default(DEFAULT_USUAL_WEEKDAY)
});

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (use YYYY-MM-DD)');

/** A week, by its Monday. */
export const weekSchema = z.object({ weekStart: localDate });

export const planWeekSchema = weekSchema.extend({
	topicId: z.string().trim().min(1, 'Choose a topic')
});

export const skipWeekSchema = weekSchema.extend({
	reason: optionalText(200)
});

/**
 * The log-session form. `confirmUnskip` and `nextWeekConflict` are set by the dialog's follow-up
 * step when the server asks (a Skipped Week, or next week already holding another topic).
 */
export const sessionSchema = z.object({
	date: localDate,
	topicId: z.string().trim().min(1, 'Choose a topic'),
	note: optionalText(2000),
	confirmUnskip: z.boolean().default(false),
	continueNextWeek: z.boolean().default(false),
	nextWeekConflict: z.enum(['', 'replace', 'shift']).default('')
});

export const updateSessionSchema = sessionSchema.extend({
	id: z.string().trim().min(1, 'ID is required')
});

/** A session as the dialogs and history lists show and edit it. */
export type SessionEntry = {
	id: string;
	date: string;
	topicId: string;
	topicTitle: string;
	note: string | null;
};

export type TopicRef = { id: string; title: string };

/** One week of the plan as the Family Worship page and the dashboard show it. */
export type PlannedWeekView = {
	weekStart: string;
	/** The week's Usual Weekday. */
	date: string;
	isCurrent: boolean;
	isPast: boolean;
	plannedTopic: TopicRef | null;
	session: SessionEntry | null;
	skip: { reason: string | null } | null;
	/** The top of the Topic Queue for an empty current or upcoming week; never stored. */
	suggestion: TopicRef | null;
};

/** This week's Family Worship on the dashboard card. */
export type FamilyWorshipCard = {
	/** done: a session is logged; skipped: a Skipped Week; planned / suggested / empty otherwise. */
	state: 'done' | 'skipped' | 'planned' | 'suggested' | 'empty';
	topic: TopicRef | null;
	/** "Today", "Tomorrow" or the week's Usual Weekday date. */
	dayLabel: string;
	skipReason: string | null;
	/** What "We did it" opens the log dialog with: today and this week's topic. */
	logDefaults: { date: string; topicId: string | null };
};
