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
